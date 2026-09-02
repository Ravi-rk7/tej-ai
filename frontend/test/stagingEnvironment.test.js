import test from "node:test";
import assert from "node:assert/strict";
import {
  readCompatibilityEnvironment,
  REQUIRED_STAGING_CONFIRMATION,
} from "../e2e/support/staging.js";

const KEYS = [
  "E2E_CONFIRM_STAGING",
  "E2E_DODO_MODE",
  "E2E_MAX_PROVIDER_SCANS",
  "E2E_RELEASE_SHA",
  "E2E_FRONTEND_URL",
  "E2E_API_URL",
  "E2E_SUPABASE_URL",
  "E2E_SUPABASE_ANON_KEY",
  "E2E_SUPABASE_SERVICE_ROLE_KEY",
];
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

const configure = () => Object.assign(process.env, {
  E2E_CONFIRM_STAGING: REQUIRED_STAGING_CONFIRMATION,
  E2E_DODO_MODE: "disabled",
  E2E_MAX_PROVIDER_SCANS: "0",
  E2E_RELEASE_SHA: "a".repeat(40),
  E2E_FRONTEND_URL: "https://app.staging.example",
  E2E_API_URL: "https://api.staging.example",
  E2E_SUPABASE_URL: "https://project.supabase.co",
  E2E_SUPABASE_ANON_KEY: "public-test-key",
  E2E_SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
});

test.after(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test("compatibility environment is staging-only, provider-free, and billing-free", () => {
  configure();
  const configuration = readCompatibilityEnvironment();
  assert.equal(configuration.releaseSha, "a".repeat(40));
  assert.equal(Object.hasOwn(configuration, "portraitUrl"), false);
  assert.equal(Object.hasOwn(configuration, "dodoApiKey"), false);

  process.env.E2E_MAX_PROVIDER_SCANS = "1";
  assert.throws(readCompatibilityEnvironment, /exactly 0/);

  configure();
  process.env.E2E_DODO_MODE = "live_mode";
  assert.throws(readCompatibilityEnvironment, /must be disabled/);

  configure();
  process.env.E2E_FRONTEND_URL = "https://app.production.example";
  assert.throws(readCompatibilityEnvironment, /staging host/);
});
