import { test, expect } from "@playwright/test";
import {
  accessTokenFor,
  apiRequest,
  completeDodoTestCheckout,
  createAdminClient,
  findUserByEmail,
  poll,
  readStagingEnvironment,
  waitForUser,
} from "./support/staging.js";

test.describe.configure({ mode: "serial" });

const configuration = readStagingEnvironment();
const runId = String(process.env.E2E_RUN_ID || Date.now())
  .replace(/[^a-z0-9-]/gi, "")
  .slice(-32);
const primaryEmail = `tejai-day12-${runId}@example.com`;
const secondaryEmail = `tejai-day12-other-${runId}@example.com`;
const initialPassword = "Day12!InitialPassword1";
const updatedPassword = "Day12!UpdatedPassword2";
const admin = createAdminClient(configuration);

let primaryUserId;
let secondaryUserId;
let scanId;
let primaryToken;
let portrait;

test.beforeAll(async () => {
  let portraitResponse;
  try {
    portraitResponse = await fetch(configuration.portraitUrl, {
      redirect: "error",
    });
  } catch {
    throw new Error("The consented staging portrait could not be downloaded");
  }
  if (
    !portraitResponse.ok ||
    portraitResponse.headers.get("content-type")?.split(";")[0] !== "image/jpeg"
  ) {
    throw new Error("The signed staging portrait response must be a JPG");
  }
  portrait = Buffer.from(await portraitResponse.arrayBuffer());
  if (portrait.length < 1_024 || portrait.length > 8 * 1024 * 1024) {
    throw new Error(
      "The consented staging portrait must be between 1 KB and 8 MB",
    );
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: secondaryEmail,
    password: initialPassword,
    email_confirm: true,
  });
  if (error || !data.user)
    throw error || new Error("Secondary staging user was not created");
  secondaryUserId = data.user.id;
});

test.afterAll(async () => {
  let cleanupError;
  if (!primaryUserId) {
    try {
      primaryUserId = (await findUserByEmail(admin, primaryEmail))?.id;
    } catch (error) {
      cleanupError = error;
    }
  }
  if (primaryUserId) {
    const { data: subscription, error } = await admin
      .from("subscriptions")
      .select("status,dodo_subscription_id")
      .eq("user_id", primaryUserId)
      .maybeSingle();
    if (error) cleanupError = error;
    if (
      subscription?.dodo_subscription_id &&
      !["cancelled", "failed", "expired"].includes(subscription.status)
    ) {
      const cancellation = await fetch(
        `${configuration.dodoApiUrl}/subscriptions/${encodeURIComponent(subscription.dodo_subscription_id)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${configuration.dodoApiKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "cancelled",
            cancel_reason: "cancelled_by_customer",
            cancellation_comment:
              "Day 12 protected staging E2E failure cleanup",
          }),
        },
      );
      if (!cancellation.ok)
        cleanupError = new Error("Dodo test subscription cleanup failed");
    }
  }
  for (const userId of [primaryUserId, secondaryUserId].filter(Boolean)) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message || ""))
      cleanupError ||= error;
  }
  if (cleanupError) throw cleanupError;
});

test("signup, verification, login, and logout", async ({ page }) => {
  await page.goto("/signup");
  await page.getByPlaceholder("Email address").fill(primaryEmail);
  await page.getByPlaceholder("Password").fill(initialPassword);
  await page.getByPlaceholder("Confirm password").fill(initialPassword);
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(
    page.getByText("Check your email to confirm your account"),
  ).toBeVisible();

  const user = await waitForUser(admin, primaryEmail);
  primaryUserId = user.id;
  const { error } = await admin.auth.admin.updateUserById(primaryUserId, {
    email_confirm: true,
  });
  if (error) throw error;

  await page.goto("/login");
  await page.getByPlaceholder("Email address").fill(primaryEmail);
  await page.getByPlaceholder("Password").fill(initialPassword);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Your Skin Progress" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome Back" }),
  ).toBeVisible();
});

test("password reset establishes a new password and authenticated session", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.getByPlaceholder("Email address").fill(primaryEmail);
  await page.getByRole("button", { name: "Send Reset Link" }).click();
  await expect(page.getByText(/if an account exists/i)).toBeVisible();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: primaryEmail,
    options: { redirectTo: `${configuration.frontendUrl}/reset-password` },
  });
  if (error || !data.properties?.action_link)
    throw error || new Error("Recovery link was not generated");
  await page.goto(data.properties.action_link);
  await expect(
    page.getByRole("heading", { name: "Choose a New Password" }),
  ).toBeVisible();
  await page.getByPlaceholder("New password").fill(updatedPassword);
  await page.getByPlaceholder("Confirm new password").fill(updatedPassword);
  await page.getByRole("button", { name: "Update Password" }).click();
  await expect(page.getByText(/Password updated/i)).toBeVisible();
  await page.getByPlaceholder("Email address").fill(primaryEmail);
  await page.getByPlaceholder("Password").fill(updatedPassword);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  primaryToken = await accessTokenFor(
    configuration,
    primaryEmail,
    updatedPassword,
  );
});

test("first free scan persists, reloads, and remains owner-only", async ({
  page,
}) => {
  await page.goto("/scan");
  await expect(
    page.getByRole("heading", {
      name: "Choose whether to process a face photo",
    }),
  ).toBeVisible();
  await page.getByLabel(/I consent to processing one face photo/i).check();
  await page.getByLabel(/I confirm that I am at least 18/i).check();
  await page
    .getByRole("button", { name: "I consent and want to continue" })
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "consented-staging.jpg",
    mimeType: "image/jpeg",
    buffer: portrait,
  });
  await page.getByRole("button", { name: "Start Cosmetic Scan" }).click();
  await page.waitForURL(/\/results\?id=[0-9a-f-]{36}$/i, { timeout: 120_000 });
  scanId = new URL(page.url()).searchParams.get("id");
  await expect(page.getByText("Glow Score", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI Routine" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Safety notes" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByText("Glow Score", { exact: true })).toBeVisible();
  const secondaryToken = await accessTokenFor(
    configuration,
    secondaryEmail,
    initialPassword,
  );
  const foreign = await apiRequest(
    configuration,
    secondaryToken,
    `/api/results/${scanId}`,
  );
  expect(foreign.response.status).toBe(404);
  expect(foreign.body.code).toBe("SCAN_NOT_FOUND");
});

test("dashboard, history, and free quota exhaustion reflect the persisted scan", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Latest Glow Score")).toBeVisible();
  await expect(page.getByText("1/1")).toBeVisible();
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "Glow Score History" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Open scan from/i }),
  ).toBeVisible();

  await page.goto("/scan");
  await page.locator('input[type="file"]').setInputFiles({
    name: "consented-staging.jpg",
    mimeType: "image/jpeg",
    buffer: portrait,
  });
  await page.getByRole("button", { name: "Start Cosmetic Scan" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a larger scan allowance" }),
  ).toBeVisible();
});

test("Dodo test checkout activates paid allocation and cancellation is webhook-confirmed", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Continue with Starter" }).click();
  await page.waitForURL(/^https:\/\/test\.checkout\.dodopayments\.com\//, {
    timeout: 30_000,
  });
  await completeDodoTestCheckout(page);
  await page.waitForURL(
    `${configuration.frontendUrl}/settings?checkout=returned`,
    { timeout: 120_000 },
  );

  const activeSubscription = await poll(
    async () => {
      const { data, error } = await admin
        .from("subscriptions")
        .select("plan,status,dodo_subscription_id")
        .eq("user_id", primaryUserId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    (subscription) =>
      subscription?.plan === "starter" &&
      subscription?.status === "active" &&
      Boolean(subscription.dodo_subscription_id),
  );

  await page.goto("/dashboard");
  await expect(page.getByText("1/15")).toBeVisible();
  await expect(page.getByText("14 scans remaining")).toBeVisible();

  const cancellation = await fetch(
    `${configuration.dodoApiUrl}/subscriptions/${encodeURIComponent(activeSubscription.dodo_subscription_id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${configuration.dodoApiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "cancelled",
        cancel_reason: "cancelled_by_customer",
        cancellation_comment: "Day 12 protected staging E2E cleanup",
      }),
    },
  );
  expect(cancellation.ok).toBe(true);
  await poll(
    async () => {
      const { data, error } = await admin
        .from("subscriptions")
        .select("status")
        .eq("user_id", primaryUserId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    (subscription) => subscription?.status === "cancelled",
  );
});

test("scan and account deletion remove the disposable staging identity", async ({
  page,
}) => {
  await page.goto(`/results?id=${encodeURIComponent(scanId)}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete result" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText(/No scans yet/i)).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByLabel("Confirmation phrase").fill("DELETE MY ACCOUNT");
  await page.getByLabel("Current password").fill(updatedPassword);
  await page.getByRole("button", { name: "Permanently delete" }).click();
  await expect(page).toHaveURL(/\/?account=deleted$/);
  await poll(
    () => admin.auth.admin.getUserById(primaryUserId),
    ({ data }) => !data?.user,
    { timeoutMs: 30_000 },
  );
});
