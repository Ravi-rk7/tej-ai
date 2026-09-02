import { test, expect } from "@playwright/test";
import {
  createAdminClient,
  readCompatibilityEnvironment,
} from "./support/staging.js";

test.describe.configure({ mode: "serial" });

const configuration = readCompatibilityEnvironment();
const admin = createAdminClient(configuration);
const password = "Day14!CompatibilityPassword1";
const runId = String(process.env.E2E_RUN_ID || Date.now())
  .replace(/[^a-z0-9-]/gi, "")
  .slice(-32);

let email;
let userId;
let scanId;
const forbiddenRequests = new WeakMap();

const safeProjectName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const signIn = async (page) => {
  await page.goto("/login");
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
};

test.beforeAll(async ({}, testInfo) => {
  email = `tejai-day14-${safeProjectName(testInfo.project.name)}-${runId}@example.com`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw createError || new Error("Compatibility user was not created");
  }
  userId = created.user.id;

  const { data: scan, error: scanError } = await admin
    .from("skin_analysis")
    .insert({
      user_id: userId,
      image_url: null,
      image_retained: false,
      glow_score: 84,
      skin_type: "Combination",
      concerns: ["Pigmentation", "Acne"],
      metrics: {
        schemaVersion: 1,
        totalScore: 84,
        healthScores: {
          dark_circles: 96,
          wrinkles: 92,
          oiliness: 83,
          pores: 85,
          blackheads: 95,
          acne: 76,
          sensitivity: 82,
          pigmentation: 68,
          dehydration: 79,
          texture: 89,
        },
      },
      routine: {
        schemaVersion: 1,
        source: "fallback",
        morning: [
          { name: "Gentle cleanser", instructions: "Cleanse gently." },
          { name: "Broad-spectrum SPF 30+", instructions: "Apply every morning." },
        ],
        night: [
          { name: "Gentle cleanser", instructions: "Cleanse gently." },
          { name: "Barrier moisturizer", instructions: "Apply a thin layer." },
        ],
        safety: {
          patchTest: "Patch-test every new product.",
          spf: "Use broad-spectrum SPF 30+ every morning.",
          cautions: "Stop if irritation occurs.",
          disclaimer: "Cosmetic wellness guidance only; not diagnosis or treatment.",
          dermatologist: null,
        },
      },
      raw_api_response: null,
      provider: "ailabtools",
      provider_version: "compatibility-fixture-v1",
    })
    .select("id")
    .single();
  if (scanError || !scan) {
    throw scanError || new Error("Compatibility scan was not seeded");
  }
  scanId = scan.id;
});

test.afterAll(async () => {
  if (!userId) return;
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !/not found/i.test(error.message || "")) throw error;
});

test.beforeEach(async ({ page }) => {
  const captured = [];
  forbiddenRequests.set(page, captured);
  page.on("request", (request) => {
    const url = new URL(request.url());
    const forbidden = url.pathname === "/api/scan"
      || url.pathname === "/api/billing/checkout"
      || url.pathname === "/api/billing/portal"
      || url.pathname.startsWith("/api/webhooks/");
    if (forbidden) captured.push(`${request.method()} ${url.pathname}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(forbiddenRequests.get(page) || []).toEqual([]);
});

test("seeded result, dashboard, history, settings, and legal pages render", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByText("Latest Glow Score")).toBeVisible();
  await expect(page.getByText("84", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "View latest result" }).click();
  await expect(page).toHaveURL(new RegExp(`/results\\?id=${scanId}$`));
  await expect(page.getByText("Glow Score", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI Routine" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Safety notes" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Combination", { exact: true })).toBeVisible();

  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "Glow Score History" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open scan from/i })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible();
  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Support and contact" })).toBeVisible();
});

test("invalid upload is rejected in the browser without a scan request", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/privacy/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: {
        schemaVersion: 1,
        noticeVersion: "day14-compatibility",
        required: false,
        granted: true,
        grantedAt: new Date().toISOString(),
      },
    }),
  }));
  await page.goto("/scan");
  await page.locator('input[type="file"]').setInputFiles({
    name: "not-a-jpeg.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByText("Only JPG or JPEG photos are supported.")).toBeVisible();
});

test("temporary dashboard outage renders a safe retryable state", async ({ page }) => {
  await page.route("**/api/dashboard", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({
      success: false,
      error: "Unable to load dashboard summary",
      code: "DASHBOARD_FETCH_FAILED",
    }),
  }));
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Dashboard unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("expired local session returns a protected result route to login", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`/results?id=${scanId}`);
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
});
