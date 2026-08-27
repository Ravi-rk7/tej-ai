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
    const { data: entitlement, error: entitlementError } = await admin
      .from("subscriptions")
      .select("user_id,plan,status")
      .eq("user_id", user.id)
      .single();
    assert(!entitlementError, "Could not verify signup entitlement");
    assert(
      entitlement.user_id === user.id &&
        entitlement.plan === "free" &&
        entitlement.status === "active",
      "Signup entitlement is not an active free plan",
    );

    const { data: serviceCheckoutClaim, error: serviceCheckoutClaimError } =
      await admin.rpc("claim_billing_checkout_attempt", {
        p_user_id: user.id,
        p_plan: "starter",
        p_idempotency_key_hash: "c".repeat(64),
        p_expires_at: new Date(Date.now() + 300_000).toISOString(),
      });
    assert(
      !serviceCheckoutClaimError &&
        Array.isArray(serviceCheckoutClaim) &&
        serviceCheckoutClaim[0]?.claimed === true,
      "Service role could not claim a private checkout attempt",
    );

    const { error: directSubscriptionReadError } = await user.client
      .from("subscriptions")
      .select("user_id,plan,status");
    assert(
      directSubscriptionReadError,
      "Browser client unexpectedly read the private subscription table",
    );

    const { error: directCheckoutReadError } = await user.client
      .from("billing_checkout_attempts")
      .select("id,state");
    assert(
      directCheckoutReadError,
      "Browser client unexpectedly read the private checkout-attempt table",
    );

    const { error: directCheckoutWriteError } = await user.client
      .from("billing_checkout_attempts")
      .insert({
        user_id: user.id,
        plan: "starter",
        idempotency_key_hash: "a".repeat(64),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
    assert(
      directCheckoutWriteError,
      "Browser client unexpectedly wrote to the private checkout-attempt table",
    );

    const { error: directCheckoutClaimError } = await user.client.rpc(
      "claim_billing_checkout_attempt",
      {
        p_user_id: user.id,
        p_plan: "starter",
        p_idempotency_key_hash: "b".repeat(64),
        p_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    );
    assert(
      directCheckoutClaimError,
      "Browser client unexpectedly executed the private checkout claim RPC",
    );

    const statusResponse = await fetch(
      new URL("/api/billing/subscription", apiBaseUrl),
      { headers: { Authorization: `Bearer ${user.token}` } },
    );
    const statusBody = await statusResponse.json();
    assert(statusResponse.status === 200, "Billing status API rejected a valid user");
    assert(statusBody.success === true, "Billing status API returned an error envelope");
    assert(
      statusBody.data.plan === "free" && statusBody.data.status === "active",
      "Billing status API did not return the active free entitlement",
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
    const { error: directScanReadError } = await current.client
      .from("skin_analysis")
      .select("id,user_id");
    assert(
      directScanReadError,
      "Browser client unexpectedly read the private scan table",
    );

    const { error: filteredScanReadError } = await current.client
      .from("skin_analysis")
      .select("id")
      .eq("user_id", other.id);
    assert(
      filteredScanReadError,
      "Browser client unexpectedly queried another user's scan",
    );

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
    assert(apiBody.data.items.length === 1, "History API crossed user boundaries");
    assert(
      apiBody.data.items[0].glowScore === current.expectedScore,
      "History API returned another user's scan",
    );

    const dashboardResponse = await fetch(new URL("/api/dashboard", apiBaseUrl), {
      headers: { Authorization: `Bearer ${current.token}` },
    });
    const dashboardBody = await dashboardResponse.json();
    assert(dashboardResponse.status === 200, "Dashboard API rejected a valid user");
    assert(dashboardBody.success === true, "Dashboard API returned an error envelope");
    assert(
      dashboardBody.data.latestScan?.glowScore === current.expectedScore,
      "Dashboard API returned another user's latest scan",
    );
  }

  console.log(
    "Private application tables, backend-only reads, API ownership, and signup entitlements verified.",
  );
} finally {
  if (createdScanIds.length > 0) {
    await admin.from("skin_analysis").delete().in("id", createdScanIds);
  }

  await Promise.all(
    createdUserIds.map((userId) => admin.auth.admin.deleteUser(userId, false)),
  );
}
