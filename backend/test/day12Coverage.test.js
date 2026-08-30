import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import {
  CHECKOUT_ATTEMPT_STATES,
  CheckoutAttemptStoreError,
  createCheckoutAttemptRepository,
  hashIdempotencyKey,
} from "../services/checkoutAttemptService.js";
import {
  createCustomerPortalService,
  PortalError,
} from "../services/customerPortalService.js";
import {
  createPrivacyRepository,
  PrivacyError,
} from "../services/privacyService.js";
import {
  createGrantConsentHandler,
  createPrivacyStatusHandler,
  createWithdrawConsentHandler,
} from "../controllers/privacyController.js";
import {
  createDeleteAccountHandler,
  createDeleteScanHandler,
} from "../controllers/deletionController.js";
import { createDodoWebhookHandler } from "../controllers/webhookController.js";
import { WebhookError } from "../services/webhookService.js";
import { createRateLimitMiddleware } from "../middleware/rateLimitMiddleware.js";
import { createAuthMiddleware } from "../middleware/authMiddleware.js";
import { createAuthRateLimitMiddleware } from "../middleware/authRateLimitMiddleware.js";
import { createBillingRateLimitMiddleware } from "../middleware/billingRateLimitMiddleware.js";
import { errorMiddleware } from "../middleware/errorMiddleware.js";
import { hashSecurityIdentifier } from "../utils/securityHash.js";
import {
  normalizeStoredRoutine,
  serializeScanResult,
} from "../services/scanResultService.js";
import { z } from "zod";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const HASH = hashIdempotencyKey("33333333-3333-4333-8333-333333333333");
const NOW = "2026-08-30T00:00:00.000Z";

const responseRecorder = () => {
  const result = { statusCode: 200, headers: {}, body: null };
  return {
    result,
    response: {
      set(name, value) {
        result.headers[name.toLowerCase()] = value;
        return this;
      },
      status(code) {
        result.statusCode = code;
        return this;
      },
      json(body) {
        result.body = body;
        return this;
      },
    },
  };
};

const attemptRow = (overrides = {}) => ({
  id: ATTEMPT_ID,
  user_id: USER_ID,
  plan: "starter",
  idempotency_key_hash: HASH,
  state: "creating",
  provider_session_id: null,
  checkout_url: null,
  failure_code: null,
  expires_at: "2026-09-01T00:00:00.000Z",
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

test("checkout attempt repository writes each terminal state through guarded updates", async () => {
  const updates = [];
  const databaseClient = {
    from(table) {
      const operation = { table };
      return {
        update(values) {
          operation.values = values;
          return this;
        },
        eq(column, value) {
          operation.eq = [column, value];
          return this;
        },
        in(column, values) {
          operation.allowed = [column, values];
          return this;
        },
        select(value) {
          operation.select = value;
          return this;
        },
        async maybeSingle() {
          updates.push(operation);
          return { data: attemptRow(operation.values), error: null };
        },
      };
    },
  };
  const repository = createCheckoutAttemptRepository({ databaseClient });

  await repository.markReady(ATTEMPT_ID, {
    providerSessionId: "session_1",
    checkoutUrl: "https://checkout.example",
  });
  await repository.markFailed(ATTEMPT_ID, "REJECTED");
  await repository.markAmbiguous(ATTEMPT_ID, "TIMEOUT");
  await repository.markExpired(ATTEMPT_ID);

  assert.deepEqual(
    updates.map(({ values }) => values.state),
    [
      CHECKOUT_ATTEMPT_STATES.READY,
      CHECKOUT_ATTEMPT_STATES.FAILED,
      CHECKOUT_ATTEMPT_STATES.AMBIGUOUS,
      CHECKOUT_ATTEMPT_STATES.EXPIRED,
    ],
  );
  assert.deepEqual(updates.at(-1).allowed[1], ["creating", "ready"]);
  assert.equal(updates[0].values.provider_session_id, "session_1");
});

test("checkout attempt repository fails closed for database and malformed-row outcomes", async () => {
  for (const databaseClient of [
    {
      rpc: async () => ({
        data: null,
        error: { message: "private database detail" },
      }),
    },
    { rpc: async () => ({ data: [], error: null }) },
    { rpc: async () => ({ data: [{ bad: true }], error: null }) },
  ]) {
    const repository = createCheckoutAttemptRepository({ databaseClient });
    await assert.rejects(
      repository.claim({
        userId: USER_ID,
        plan: "starter",
        idempotencyKeyHash: HASH,
        expiresAt: NOW,
      }),
      (error) => error instanceof CheckoutAttemptStoreError,
    );
  }

  const repository = createCheckoutAttemptRepository({
    databaseClient: {
      from: () => ({
        update() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        select() {
          return this;
        },
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    },
  });
  await assert.rejects(
    repository.markFailed(ATTEMPT_ID, "FAILED"),
    CheckoutAttemptStoreError,
  );
});

const portalEnv = {
  DODO_ENVIRONMENT: "test_mode",
  DODO_API_BASE_URL: "https://test.dodopayments.com",
  DODO_API_KEY: "test-key",
  FRONTEND_URL: "https://staging.tej-ai.example",
};

test("customer portal maps timeout, rejection, provider failure, and unsafe output to public errors", async () => {
  const cases = [
    [{ code: "ETIMEDOUT", response: undefined }, "BILLING_PROVIDER_TIMEOUT"],
    [{ response: { status: 503 } }, "BILLING_PROVIDER_UNAVAILABLE"],
    [{ response: { status: 401 } }, "BILLING_PROVIDER_REJECTED"],
  ];
  for (const [properties, expectedCode] of cases) {
    const service = createCustomerPortalService({
      runtimeEnv: portalEnv,
      httpClient: {
        post: async () => {
          throw axios.AxiosError.from(
            new Error("private"),
            properties.code,
            {},
            null,
            properties.response,
          );
        },
      },
    });
    await assert.rejects(
      service.createSession("cus_safe"),
      (error) => error.publicCode === expectedCode,
    );
  }

  for (const response of [
    { data: {} },
    { data: { link: "https://evil.example/portal" } },
  ]) {
    const service = createCustomerPortalService({
      runtimeEnv: portalEnv,
      httpClient: { post: async () => response },
    });
    await assert.rejects(
      service.createSession("cus_safe"),
      (error) =>
        error instanceof PortalError &&
        error.publicCode === "BILLING_INVALID_PROVIDER_RESPONSE",
    );
  }
});

test("customer portal rejects invalid configuration, customer identity, and return origins before transport", async () => {
  const invalidInputs = [null, "", "spaces are unsafe", "x".repeat(256)];
  for (const value of invalidInputs) {
    await assert.rejects(
      createCustomerPortalService({ runtimeEnv: portalEnv }).createSession(
        value,
      ),
      (error) => error.publicCode === "BILLING_PORTAL_NOT_AVAILABLE",
    );
  }
  for (const runtimeEnv of [
    { ...portalEnv, DODO_API_KEY: "" },
    { ...portalEnv, DODO_API_BASE_URL: "https://evil.example" },
    { ...portalEnv, FRONTEND_URL: "javascript:alert(1)" },
  ]) {
    await assert.rejects(
      createCustomerPortalService({ runtimeEnv }).createSession("cus_safe"),
      (error) => error.publicCode === "BILLING_CONFIGURATION_ERROR",
    );
  }
});

test("privacy repository reads and appends the minimal consent event contract", async () => {
  const operations = [];
  const databaseClient = {
    from(table) {
      const operation = { table };
      const builder = {
        select(value) {
          operation.select = value;
          return this;
        },
        eq(column, value) {
          (operation.filters ||= []).push([column, value]);
          return this;
        },
        order(column, options) {
          (operation.orders ||= []).push([column, options]);
          return this;
        },
        limit(value) {
          operation.limit = value;
          return this;
        },
        insert(value) {
          operation.insert = value;
          return this;
        },
        async maybeSingle() {
          operations.push(operation);
          return { data: null, error: null };
        },
        async single() {
          operations.push(operation);
          return {
            data: {
              action: "granted",
              notice_version: "v1",
              adult_confirmed: true,
              created_at: NOW,
            },
            error: null,
          };
        },
      };
      return builder;
    },
  };
  const repository = createPrivacyRepository({ databaseClient });
  assert.equal(await repository.getLatest(USER_ID), null);
  const saved = await repository.append({
    userId: USER_ID,
    action: "granted",
    noticeVersion: "v1",
    adultConfirmed: true,
  });
  assert.equal(saved.action, "granted");
  assert.equal(
    operations[0].filters.some((entry) => entry[1] === USER_ID),
    true,
  );
  assert.equal(operations[1].insert.purpose, "face_scan_analysis");
});

test("privacy repository and handlers expose stable failures without private details", async () => {
  const failedRepository = createPrivacyRepository({
    databaseClient: {
      from: () => ({
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle: async () => ({ error: new Error("private") }),
      }),
    },
  });
  await assert.rejects(failedRepository.getLatest(USER_ID), PrivacyError);

  const handlers = [
    createPrivacyStatusHandler({
      loadStatus: async () => {
        throw new Error("private");
      },
      privacyLogger: { error() {} },
    }),
    createGrantConsentHandler({
      grantConsent: async () => {
        throw new PrivacyError("KNOWN", "Known failure", 409);
      },
      noticeVersion: () => "v1",
    }),
    createWithdrawConsentHandler({
      withdrawConsent: async () => {
        throw new Error("private");
      },
      privacyLogger: { error() {} },
    }),
  ];
  const requests = [
    { user: { id: USER_ID } },
    {
      user: { id: USER_ID },
      body: {
        noticeVersion: "v1",
        faceScanProcessing: true,
        adultConfirmation: true,
      },
    },
    { user: { id: USER_ID }, body: {} },
  ];
  const expected = [503, 409, 503];
  for (let index = 0; index < handlers.length; index += 1) {
    const recorded = responseRecorder();
    await handlers[index](requests[index], recorded.response);
    assert.equal(recorded.result.statusCode, expected[index]);
    assert.equal(
      JSON.stringify(recorded.result.body).includes("private"),
      false,
    );
  }
});

test("deletion controllers pass bounded inputs and map known and unknown failures", async () => {
  const scan = responseRecorder();
  await createDeleteScanHandler({
    deleteScan: async (input) => ({ ...input, deleted: true }),
  })({ user: { id: USER_ID }, params: { scanId: ATTEMPT_ID } }, scan.response);
  assert.equal(scan.result.body.data.deleted, true);

  const account = responseRecorder();
  await createDeleteAccountHandler({
    deleteAccount: async (input) => ({ email: input.email, deleted: true }),
  })(
    {
      user: { id: USER_ID, email: "owner@example.com" },
      ip: "127.0.0.1",
      body: {
        confirmation: "DELETE MY ACCOUNT",
        currentPassword: "safe-password",
      },
    },
    account.response,
  );
  assert.equal(account.result.body.data.deleted, true);

  for (const handler of [
    createDeleteScanHandler({
      deleteScan: async () => {
        throw new PrivacyError("KNOWN", "Known failure", 409);
      },
    }),
    createDeleteAccountHandler({
      deleteAccount: async () => {
        throw new Error("private");
      },
      deletionLogger: { error() {} },
    }),
  ]) {
    const recorded = responseRecorder();
    await handler(
      {
        user: { id: USER_ID, email: "owner@example.com" },
        ip: "127.0.0.1",
        params: { scanId: ATTEMPT_ID },
        body: {
          confirmation: "DELETE MY ACCOUNT",
          currentPassword: "safe-password",
        },
      },
      recorded.response,
    );
    assert.equal([409, 503].includes(recorded.result.statusCode), true);
  }
});

test("webhook controller returns stable success and typed retry semantics", async () => {
  let received;
  const success = responseRecorder();
  await createDodoWebhookHandler({
    processWebhook: async (...args) => {
      received = args;
    },
  })(
    {
      body: Buffer.from("{}"),
      headers: {
        "webhook-id": "id",
        "webhook-signature": "sig",
        "webhook-timestamp": "1",
      },
    },
    success.response,
  );
  assert.equal(success.result.body.data.received, true);
  assert.equal(received[1]["webhook-id"], "id");

  for (const error of [
    new WebhookError("Bad webhook", 400, "WEBHOOK_INVALID"),
    new WebhookError("Retry webhook", 503, "WEBHOOK_UNAVAILABLE", {
      retry: true,
    }),
    new Error("private"),
  ]) {
    const logs = [];
    const recorded = responseRecorder();
    await createDodoWebhookHandler({
      processWebhook: async () => {
        throw error;
      },
      webhookLogger: {
        warn: (...args) => logs.push(args),
        error: (...args) => logs.push(args),
      },
    })({ body: Buffer.from("{}"), headers: {} }, recorded.response);
    assert.equal(
      JSON.stringify(recorded.result.body).includes("private"),
      false,
    );
    assert.equal(logs.length, 1);
  }
});

test("rate limiter publishes bounded headers, enforces 429, and bypasses absent identities", async () => {
  let nextCalls = 0;
  const middleware = createRateLimitMiddleware({
    keyPrefix: "day12",
    limit: 2,
    window: "1 m",
    now: () => 1_000,
    limiterFactory: () => ({
      limit: async () => ({ success: false, remaining: -2, reset: 3_500 }),
    }),
    rateLogger: { warn() {}, error() {} },
  });
  const recorded = responseRecorder();
  await middleware(
    { user: { id: USER_ID }, requestId: "request-1" },
    recorded.response,
    () => {
      nextCalls += 1;
    },
  );
  assert.equal(recorded.result.statusCode, 429);
  assert.equal(recorded.result.headers["retry-after"], "3");
  assert.equal(recorded.result.headers["x-ratelimit-remaining"], "0");

  await middleware({ user: null }, responseRecorder().response, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 1);
});

test("authentication middleware covers accepted, malformed, rejected, and unavailable tokens", async () => {
  let nextCalls = 0;
  const accepted = createAuthMiddleware({
    getUser: async () => ({
      data: { user: { id: USER_ID, email: "owner@example.com" } },
      error: null,
    }),
  });
  const acceptedResponse = responseRecorder();
  const acceptedRequest = { headers: { authorization: "Bearer aaa.bbb.ccc" } };
  await accepted(acceptedRequest, acceptedResponse.response, () => {
    nextCalls += 1;
  });
  assert.equal(acceptedRequest.user.id, USER_ID);

  for (const { authorization, getUser } of [
    {
      authorization: undefined,
      getUser: async () => assert.fail("invalid token must not reach provider"),
    },
    {
      authorization: "Bearer aaa.bbb.ccc",
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    {
      authorization: "Bearer aaa.bbb.ccc",
      getUser: async () => {
        throw Object.create(null);
      },
    },
  ]) {
    const recorded = responseRecorder();
    await createAuthMiddleware({
      getUser,
      authLogger: { warn() {}, error() {} },
    })(
      { headers: { authorization }, requestId: "request-1" },
      recorded.response,
      () => {
        nextCalls += 1;
      },
    );
    assert.equal(recorded.result.statusCode, 401);
  }
  assert.equal(nextCalls, 1);
});

test("specialized rate limiters normalize missing identity inputs and incomplete provider decisions", async () => {
  let authIdentifier;
  let authContinued = false;
  const authResponse = responseRecorder();
  await createAuthRateLimitMiddleware({
    keyPrefix: "day12-auth",
    limit: 3,
    window: "1 m",
    limiterFactory: () => ({
      limit: async (identifier) => {
        authIdentifier = identifier;
        return { success: true, remaining: null, reset: null };
      },
    }),
  })(
    { body: {}, socket: { remoteAddress: "127.0.0.2" } },
    authResponse.response,
    () => {
      authContinued = true;
    },
  );
  assert.equal(authContinued, true);
  assert.match(authIdentifier, /^[a-f0-9]{64}$/);
  assert.equal(authResponse.result.headers["x-ratelimit-remaining"], "0");

  let billingContinued = false;
  const billingResponse = responseRecorder();
  await createBillingRateLimitMiddleware({
    limiter: {
      limit: async () => ({
        success: true,
        remaining: undefined,
        reset: Number.NaN,
      }),
    },
    now: () => 10_000,
  })({ user: { id: USER_ID } }, billingResponse.response, () => {
    billingContinued = true;
  });
  assert.equal(billingContinued, true);
  assert.equal(billingResponse.result.headers["x-ratelimit-reset"], "10");
});

test("central error middleware maps payload, validation, public, and private failures", () => {
  const request = {
    path: "/api/webhook",
    method: "POST",
    requestId: "request-1",
  };
  const errors = [
    [{ type: "entity.too.large" }, 413, "WEBHOOK_BODY_TOO_LARGE"],
    [
      Object.assign(new SyntaxError("private JSON parser detail"), {
        status: 400,
        body: "{}",
      }),
      400,
      "INVALID_JSON",
    ],
    [
      z.object({ value: z.string() }).safeParse({ value: 2 }).error,
      400,
      undefined,
    ],
    [
      Object.assign(new Error("Safe public conflict"), {
        statusCode: 409,
        publicCode: "PUBLIC_CONFLICT",
      }),
      409,
      "PUBLIC_CONFLICT",
    ],
    [
      Object.assign(new Error("private"), {
        statusCode: 500,
        publicMessage: "Safe unavailable",
        publicCode: "SAFE_UNAVAILABLE",
      }),
      500,
      "SAFE_UNAVAILABLE",
    ],
  ];
  for (const [error, status, code] of errors) {
    const recorded = responseRecorder();
    errorMiddleware(error, request, recorded.response, () => {});
    assert.equal(recorded.result.statusCode, status);
    assert.equal(recorded.result.body.code, code);
    assert.equal(
      JSON.stringify(recorded.result.body).includes("private"),
      false,
    );
  }
});

test("security identifiers use keyed HMAC in public-style configuration and stable local hashing otherwise", () => {
  const hmac = hashSecurityIdentifier("owner", {
    SECURITY_HMAC_SECRET: "day12-secret",
  });
  const unkeyed = hashSecurityIdentifier("owner", { SECURITY_HMAC_SECRET: "" });
  const unknown = hashSecurityIdentifier(null, { SECURITY_HMAC_SECRET: "" });
  assert.match(hmac, /^[a-f0-9]{64}$/);
  assert.match(unknown, /^[a-f0-9]{64}$/);
  assert.notEqual(hmac, unkeyed);
});

test("scan result compatibility rejects malformed values and normalizes supported legacy shapes", () => {
  assert.equal(normalizeStoredRoutine(null), null);
  assert.equal(normalizeStoredRoutine([null, "", {}]), null);
  const normalized = normalizeStoredRoutine({
    source: "untrusted",
    morning: [
      { title: " Cleanse ", description: " Gently. " },
      42,
      { name: "" },
    ],
    night: [" Moisturize "],
    safety: {
      patchTest: null,
      spf: 42,
      disclaimer: " Cosmetic only. ",
      extra: "ignored",
    },
  });
  assert.equal(normalized.source, "legacy");
  assert.deepEqual(normalized.morning, [
    { name: "Cleanse", instructions: "Gently." },
  ]);
  assert.equal(normalized.safety.patchTest, null);
  assert.notEqual(normalized.safety.spf, 42);

  assert.throws(() => serializeScanResult(null), /Invalid persisted scan row/);
  const result = serializeScanResult({
    id: "",
    created_at: 42,
    glow_score: Number.NaN,
    skin_type: " ",
    concerns: [
      { label: " Texture ", score: 69, severity: "moderate" },
      "",
      null,
      { bad: true },
    ],
    metrics: {
      schemaVersion: "bad",
      totalScore: 150,
      healthScores: { texture: 70, acne: "bad" },
      warnings: [
        "UNKNOWN",
        null,
        { code: "GLASSES_DETECTED" },
        { code: "UNKNOWN" },
      ],
    },
    routine: {},
  });
  assert.equal(result.glowScore, null);
  assert.equal(result.concernDetails[0].key, "texture");
  assert.deepEqual(
    result.warnings.map(({ code }) => code),
    ["GLASSES_DETECTED"],
  );
  assert.equal(result.metrics.schemaVersion, 1);
  assert.equal(result.routine, null);
});
