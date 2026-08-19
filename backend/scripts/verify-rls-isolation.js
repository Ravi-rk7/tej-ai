import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  RLS_TEST_PROJECT_REF,
  RLS_TEST_CONFIRM,
  RLS_TEST_API_BASE_URL,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase URL, anon key, and service role key are required");
}

const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
if (
  RLS_TEST_CONFIRM !== "staging" ||
  RLS_TEST_PROJECT_REF !== projectRef ||
  !RLS_TEST_API_BASE_URL
) {
  throw new Error(
    "Refusing to run: confirm the staging project ref and staging API base URL",
  );
}

const apiBaseUrl = new URL(RLS_TEST_API_BASE_URL);
if (
  apiBaseUrl.protocol !== "https:" ||
  !apiBaseUrl.hostname.toLowerCase().includes("staging")
) {
  throw new Error("RLS_TEST_API_BASE_URL must be an HTTPS staging host");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdUserIds = [];
const createdScanIds = [];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const createTestUser = async (label) => {
  const nonce = randomBytes(12).toString("hex");
  const email = `tejai-rls-${label}-${nonce}@example.com`;
  const password = `Rls!${randomBytes(18).toString("base64url")}9aA`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Could not create ${label} isolation user`);
  }

  createdUserIds.push(data.user.id);

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signInData, error: signInError } =
    await client.auth.signInWithPassword({ email, password });
  if (signInError)
    throw new Error(`Could not authenticate ${label} isolation user`);

  return {
    id: data.user.id,
    client,
    token: signInData.session.access_token,
    expectedScore: label === "a" ? 71 : 83,
  };
};

try {
  const [userA, userB] = await Promise.all([
    createTestUser("a"),
    createTestUser("b"),
  ]);

  for (const user of [userA, userB]) {
    const { data: entitlements, error: entitlementError } = await user.client
      .from("subscriptions")
      .select("user_id,plan,status");
    assert(!entitlementError, "Could not verify signup entitlement");
    assert(
      entitlements.length === 1 &&
        entitlements[0].user_id === user.id &&
        entitlements[0].plan === "free" &&
        entitlements[0].status === "active",
      "Signup entitlement is not an active free plan",
    );
  }

  const { data: scans, error: insertError } = await admin
    .from("skin_analysis")
    .insert([
      {
        user_id: userA.id,
        glow_score: 71,
        concerns: [],
        routine: {},
        metrics: {},
      },
      {
        user_id: userB.id,
        glow_score: 83,
        concerns: [],
        routine: {},
        metrics: {},
      },
    ])
    .select("id,user_id");
  assert(
    !insertError && scans.length === 2,
    "Could not create isolation scan fixtures",
  );
  createdScanIds.push(...scans.map((scan) => scan.id));

  for (const [current, other] of [
    [userA, userB],
    [userB, userA],
  ]) {
    const { data: visible, error: visibleError } = await current.client
      .from("skin_analysis")
      .select("id,user_id");
    assert(!visibleError, "Authenticated scan read failed");
    assert(visible.length === 1, "A user could see more than their own scan");
    assert(visible[0].user_id === current.id, "A user saw another user's scan");

    const { data: forbidden, error: forbiddenError } = await current.client
      .from("skin_analysis")
      .select("id")
      .eq("user_id", other.id);
    assert(!forbiddenError, "Cross-user filtered read failed unexpectedly");
    assert(forbidden.length === 0, "Cross-user scan was readable");

    const { error: writeError } = await current.client
      .from("skin_analysis")
      .insert({ user_id: current.id, glow_score: 50 });
    assert(writeError, "Browser client unexpectedly inserted a scan");

    const apiResponse = await fetch(new URL("/api/history", apiBaseUrl), {
      headers: { Authorization: `Bearer ${current.token}` },
    });
    const apiBody = await apiResponse.json();
    assert(apiResponse.status === 200, "History API rejected a valid user");
    assert(apiBody.success === true, "History API returned an error envelope");
    assert(apiBody.data.length === 1, "History API crossed user boundaries");
    assert(
      apiBody.data[0].glowScore === current.expectedScore,
      "History API returned another user's scan",
    );
  }

  console.log(
    "RLS isolation, read-only access, and signup entitlements verified.",
  );
} finally {
  if (createdScanIds.length > 0) {
    await admin.from("skin_analysis").delete().in("id", createdScanIds);
  }

  await Promise.all(
    createdUserIds.map((userId) => admin.auth.admin.deleteUser(userId, false)),
  );
}
