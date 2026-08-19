import test from "node:test";
import assert from "node:assert/strict";
import { createAuthRateLimitMiddleware } from "../middleware/authRateLimitMiddleware.js";

const createResponse = () => {
  const headers = new Map();
  return {
    statusCode: 200,
    body: null,
    set(name, value) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
  };
};

test("auth limiter hashes IP and email instead of storing raw identifiers", async () => {
  let receivedIdentifier;
  const middleware = createAuthRateLimitMiddleware({
    keyPrefix: "test-auth",
    limit: 5,
    window: "15 m",
    limiterFactory: () => ({
      limit: async (identifier) => {
        receivedIdentifier = identifier;
        return { success: true, remaining: 4, reset: Date.now() + 60_000 };
      },
    }),
  });
  const response = createResponse();
  let nextCalled = false;

  await middleware(
    { body: { email: "Person@Example.com" }, ip: "127.0.0.1" },
    response,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, true);
  assert.match(receivedIdentifier, /^[a-f0-9]{64}$/);
  assert.equal(receivedIdentifier.includes("person@example.com"), false);
  assert.equal(response.getHeader("x-ratelimit-limit"), "5");
  assert.equal(response.getHeader("x-ratelimit-remaining"), "4");
});

test("auth limiter returns a stable 429 response with retry metadata", async () => {
  const middleware = createAuthRateLimitMiddleware({
    keyPrefix: "test-auth",
    limit: 3,
    window: "1 h",
    limiterFactory: () => ({
      limit: async () => ({
        success: false,
        remaining: 0,
        reset: Date.now() + 30_000,
      }),
    }),
  });
  const response = createResponse();

  await middleware(
    { body: { email: "person@example.com" }, ip: "127.0.0.1" },
    response,
    () => assert.fail("next must not run after a rejected limit"),
  );

  assert.equal(response.statusCode, 429);
  assert.equal(response.body.code, "AUTH_RATE_LIMITED");
  assert.equal(response.body.success, false);
  assert.ok(Number(response.getHeader("retry-after")) >= 1);
});

test("auth limiter fails closed when the rate-limit service is unavailable", async () => {
  const middleware = createAuthRateLimitMiddleware({
    keyPrefix: "test-auth",
    limit: 3,
    window: "1 h",
    limiterFactory: () => {
      throw new Error("unavailable");
    },
  });
  const response = createResponse();

  await middleware(
    { body: { email: "person@example.com" }, ip: "127.0.0.1" },
    response,
    () => assert.fail("next must not run when limiter is unavailable"),
  );

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "AUTH_RATE_LIMIT_UNAVAILABLE");
});
