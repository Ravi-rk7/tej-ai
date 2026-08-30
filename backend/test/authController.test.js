import test from "node:test";
import assert from "node:assert/strict";
import { createAuthHandlers } from "../controllers/authController.js";
import { createAuthService } from "../services/authService.js";

const responseRecorder = () => {
  const result = { body: null, headers: {}, statusCode: 200 };
  return {
    result,
    response: {
      set(name, value) {
        result.headers[name.toLowerCase()] = value;
        return this;
      },
      status(value) {
        result.statusCode = value;
        return this;
      },
      json(value) {
        result.body = value;
        return this;
      },
    },
  };
};

test("login normalizes credentials and returns only the public session contract", async () => {
  let received;
  const handlers = createAuthHandlers({
    signIn: async (credentials) => {
      received = credentials;
      return {
        data: {
          session: {
            access_token: "access",
            refresh_token: "refresh",
            expires_at: 1_800_000_000,
            expires_in: 3600,
            token_type: "bearer",
            provider_token: "must-not-return",
          },
          user: {
            id: "user-1",
            email: "person@example.com",
            metadata: { private: true },
          },
        },
        error: null,
      };
    },
  });
  const { response, result } = responseRecorder();

  await handlers.login(
    {
      body: { email: " Person@Example.com ", password: "secret" },
      ip: "127.0.0.1",
    },
    response,
    (error) => {
      throw error;
    },
  );

  assert.deepEqual(received, {
    email: "person@example.com",
    password: "secret",
    clientIp: "127.0.0.1",
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.deepEqual(result.body.data.user, {
    id: "user-1",
    email: "person@example.com",
  });
  assert.equal("provider_token" in result.body.data.session, false);
});

test("login uses one stable response for provider rejection and malformed input", async () => {
  const rejected = createAuthHandlers({
    signIn: async () => ({
      data: { session: null, user: null },
      error: new Error("private"),
    }),
  });
  const first = responseRecorder();
  await rejected.login(
    { body: { email: "person@example.com", password: "wrong" } },
    first.response,
    (error) => {
      throw error;
    },
  );
  assert.equal(first.result.statusCode, 401);
  assert.equal(first.result.body.code, "AUTH_INVALID_CREDENTIALS");

  let validationError;
  const malformed = responseRecorder();
  await rejected.login(
    { body: { email: "not-an-email", password: "secret", extra: true } },
    malformed.response,
    (error) => {
      validationError = error;
    },
  );
  assert.equal(validationError?.name, "ZodError");
});

test("password reset is enumeration-safe on provider rejection and thrown failures", async () => {
  const logs = [];
  const common = {
    authLogger: {
      warn(...args) {
        logs.push(args);
      },
      error(...args) {
        logs.push(args);
      },
    },
    frontendUrl: () => "https://staging.tejai.example",
  };
  let received;
  const rejected = createAuthHandlers({
    ...common,
    sendReset: async (input) => {
      received = input;
      return { error: { status: 429, message: "private provider detail" } };
    },
  });
  const first = responseRecorder();
  await rejected.requestPasswordReset(
    {
      body: { email: " Person@Example.com " },
      ip: "127.0.0.1",
    },
    first.response,
    (error) => {
      throw error;
    },
  );
  assert.equal(first.result.statusCode, 200);
  assert.equal(
    received.redirectTo,
    "https://staging.tejai.example/reset-password",
  );
  assert.equal(JSON.stringify(first.result.body).includes("private"), false);

  const unavailable = createAuthHandlers({
    ...common,
    sendReset: async () => {
      throw new Error("private transport detail");
    },
  });
  const second = responseRecorder();
  await unavailable.requestPasswordReset(
    {
      body: { email: "person@example.com" },
      requestId: "request-1",
    },
    second.response,
    (error) => {
      throw error;
    },
  );
  assert.equal(second.result.statusCode, 200);
  assert.equal(
    JSON.stringify(logs).includes("private transport detail"),
    false,
  );

  let validationError;
  await unavailable.requestPasswordReset(
    { body: { email: "bad" } },
    responseRecorder().response,
    (error) => {
      validationError = error;
    },
  );
  assert.equal(validationError?.name, "ZodError");
});

test("auth service creates isolated clients and forwards only intended auth inputs", async () => {
  const calls = [];
  const clientFactory = (...factoryArgs) => {
    calls.push(["factory", ...factoryArgs]);
    return {
      auth: {
        signInWithPassword: async (input) => {
          calls.push(["login", input]);
          return { data: {} };
        },
        resetPasswordForEmail: async (...args) => {
          calls.push(["reset", ...args]);
          return { data: {} };
        },
        admin: {
          deleteUser: async (...args) => {
            calls.push(["delete", ...args]);
            return { data: {} };
          },
        },
      },
    };
  };
  const service = createAuthService({
    clientFactory,
    runtimeEnv: {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "server-only",
    },
  });

  await service.signInWithPassword({
    email: "a@example.com",
    password: "secret",
    clientIp: "127.0.0.1",
  });
  await service.sendPasswordResetEmail({
    email: "a@example.com",
    redirectTo: "https://app.example/reset",
  });
  await service.deleteAuthUser("user-1");

  assert.equal(calls.filter(([name]) => name === "factory").length, 3);
  assert.deepEqual(calls.find(([name]) => name === "login")[1], {
    email: "a@example.com",
    password: "secret",
  });
  assert.deepEqual(calls.find(([name]) => name === "delete").slice(1), [
    "user-1",
    false,
  ]);
  const firstOptions = calls[0][3];
  assert.equal(firstOptions.global.headers["Sb-Forwarded-For"], "127.0.0.1");
  const secondFactory = calls.filter(([name]) => name === "factory")[1];
  assert.equal(secondFactory[3].global, undefined);
});

test("auth service fails before client creation when server credentials are absent", async () => {
  const service = createAuthService({
    clientFactory: () => assert.fail("client must not be created"),
    runtimeEnv: {},
  });
  await assert.rejects(
    service.signInWithPassword({ email: "a@example.com", password: "secret" }),
    /credentials are not configured/,
  );
});
