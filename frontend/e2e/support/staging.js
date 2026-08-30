import { createClient } from "@supabase/supabase-js";
import { expect } from "@playwright/test";

export const REQUIRED_STAGING_CONFIRMATION = "I_ACKNOWLEDGE_STAGING_ONLY";

const required = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value)
    throw new Error(`${name} is required for the protected staging E2E suite`);
  return value;
};

const canonicalHttpsOrigin = (name) => {
  const value = required(name);
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== value.replace(/\/$/, "")
  ) {
    throw new Error(`${name} must be a canonical HTTPS origin`);
  }
  if (!parsed.hostname.toLowerCase().includes("staging")) {
    throw new Error(`${name} must identify a staging host`);
  }
  return parsed.origin;
};

export const readStagingEnvironment = () => {
  if (process.env.E2E_CONFIRM_STAGING !== REQUIRED_STAGING_CONFIRMATION) {
    throw new Error(
      `Set E2E_CONFIRM_STAGING=${REQUIRED_STAGING_CONFIRMATION} to authorize staging-only E2E`,
    );
  }
  if (process.env.E2E_DODO_MODE !== "test_mode") {
    throw new Error(
      "E2E_DODO_MODE must be test_mode; live billing is forbidden",
    );
  }
  if (process.env.E2E_MAX_PROVIDER_SCANS !== "1") {
    throw new Error("E2E_MAX_PROVIDER_SCANS must be exactly 1 per E2E pass");
  }

  const releaseSha = required("E2E_RELEASE_SHA");
  if (!/^[a-f0-9]{40}$/i.test(releaseSha)) {
    throw new Error("E2E_RELEASE_SHA must be the full deployed Git commit SHA");
  }

  const frontendUrl = canonicalHttpsOrigin("E2E_FRONTEND_URL");
  const apiUrl = canonicalHttpsOrigin("E2E_API_URL");
  const supabaseUrl = required("E2E_SUPABASE_URL").replace(/\/$/, "");
  if (new URL(supabaseUrl).protocol !== "https:") {
    throw new Error("E2E_SUPABASE_URL must use HTTPS");
  }
  const portraitUrl = new URL(required("E2E_CONSENTED_JPEG_URL"));
  if (
    portraitUrl.protocol !== "https:" ||
    portraitUrl.origin !== new URL(supabaseUrl).origin ||
    !portraitUrl.pathname.startsWith("/storage/v1/object/sign/")
  ) {
    throw new Error(
      "E2E_CONSENTED_JPEG_URL must be a private signed URL from staging Supabase Storage",
    );
  }

  return Object.freeze({
    frontendUrl,
    apiUrl,
    releaseSha,
    supabaseUrl,
    supabaseAnonKey: required("E2E_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: required("E2E_SUPABASE_SERVICE_ROLE_KEY"),
    portraitUrl: portraitUrl.toString(),
    dodoApiKey: required("E2E_DODO_TEST_API_KEY"),
    dodoApiUrl: "https://test.dodopayments.com",
  });
};

export const createAdminClient = (configuration) =>
  createClient(
    configuration.supabaseUrl,
    configuration.supabaseServiceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

export const createPublicClient = (configuration) =>
  createClient(configuration.supabaseUrl, configuration.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const findUserByEmail = async (admin, email) => {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    if (user) return user;
    if (data.users.length < 1000) break;
  }
  return null;
};

export const waitForUser = async (admin, email, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const user = await findUserByEmail(admin, email);
    if (user) return user;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The staging signup did not create an authentication user");
};

export const accessTokenFor = async (configuration, email, password) => {
  const client = createPublicClient(configuration);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session?.access_token)
    throw error || new Error("Staging access token missing");
  return data.session.access_token;
};

export const apiRequest = async (configuration, token, path, options = {}) => {
  const response = await fetch(`${configuration.apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
};

export const poll = async (
  load,
  accept,
  { timeoutMs = 90_000, intervalMs = 1_000 } = {},
) => {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await load();
    if (accept(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `Timed out waiting for staging state; latest=${JSON.stringify(latest)}`,
  );
};

const fillAcrossFrames = async (page, patterns, selectors, value) => {
  for (const frame of page.frames()) {
    for (const pattern of patterns) {
      const candidates = [
        frame.getByLabel(pattern),
        frame.getByPlaceholder(pattern),
      ];
      for (const candidate of candidates) {
        if (await candidate.count().catch(() => 0)) {
          await candidate.first().fill(value);
          return;
        }
      }
    }
    for (const selector of selectors) {
      const candidate = frame.locator(selector);
      if (await candidate.count().catch(() => 0)) {
        await candidate.first().fill(value);
        return;
      }
    }
  }
  throw new Error(
    `Dodo checkout field was not found: ${patterns.map(String).join(", ")}`,
  );
};

export const completeDodoTestCheckout = async (page) => {
  expect(new URL(page.url()).hostname).toBe("test.checkout.dodopayments.com");
  const cardOption = page
    .getByRole("button", { name: /card|credit|debit/i })
    .first();
  if (await cardOption.count()) await cardOption.click();

  await fillAcrossFrames(
    page,
    [/card number/i, /cardnumber/i],
    ['input[autocomplete="cc-number"]'],
    "4242424242424242",
  );
  await fillAcrossFrames(
    page,
    [/expir/i, /mm.*yy/i],
    ['input[autocomplete="cc-exp"]'],
    "0632",
  );
  await fillAcrossFrames(
    page,
    [/cvc/i, /cvv/i, /security code/i],
    ['input[autocomplete="cc-csc"]'],
    "123",
  );

  for (const frame of page.frames()) {
    const name = frame
      .getByLabel(/name on card|cardholder name/i)
      .or(frame.getByPlaceholder(/name on card|cardholder name/i));
    if (await name.count().catch(() => 0))
      await name.first().fill("Tej AI Staging");
  }

  for (const frame of page.frames()) {
    const submit = frame
      .getByRole("button", { name: /pay|subscribe|complete purchase/i })
      .last();
    if (await submit.count().catch(() => 0)) {
      await expect(submit).toBeEnabled();
      await submit.click();
      return;
    }
  }
  throw new Error("Dodo checkout submit button was not found");
};
