import test from "node:test";
import assert from "node:assert/strict";
import {
  createReserveScanQuotaMiddleware,
  createScanQuotaPrecheck,
} from "../middleware/scanLimitMiddleware.js";

const responseRecorder = () => {
  const result = { body: null, statusCode: 200 };
  return {
    result,
    response: {
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

test("quota precheck skips anonymous requests and attaches available quota", async () => {
  let calls = 0;
  const middleware = createScanQuotaPrecheck({
    loadQuota: async () => {
      calls += 1;
      return { used: 0, limit: 1 };
    },
    quotaLogger: { warn() {}, error() {} },
  });
  let nextCalls = 0;
  await middleware({}, responseRecorder().response, () => {
    nextCalls += 1;
  });
  assert.equal(calls, 0);

  const request = { user: { id: "user-1" } };
  await middleware(request, responseRecorder().response, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 2);
  assert.deepEqual(request.scanInfo, { used: 0, limit: 1 });
});

test("quota precheck rejects exhausted and unavailable allowance", async () => {
  const exhausted = createScanQuotaPrecheck({
    loadQuota: async () => ({ used: 1, limit: 1 }),
    quotaLogger: { warn() {}, error() {} },
  });
  const first = responseRecorder();
  await exhausted({ user: { id: "user-1" } }, first.response, () =>
    assert.fail("must reject"),
  );
  assert.equal(first.result.statusCode, 403);
  assert.equal(first.result.body.code, "SCAN_LIMIT_REACHED");

  const unavailable = createScanQuotaPrecheck({
    loadQuota: async () => {
      throw Object.assign(new Error("private"), {
        publicCode: "QUOTA_DB_DOWN",
      });
    },
    quotaLogger: { warn() {}, error() {} },
  });
  const second = responseRecorder();
  await unavailable({ user: { id: "user-1" } }, second.response, () =>
    assert.fail("must reject"),
  );
  assert.equal(second.result.statusCode, 503);
  assert.equal(second.result.body.code, "SCAN_LIMIT_UNAVAILABLE");
});

test("atomic reservation attaches a grant and releases images on denial or failure", async () => {
  let releases = 0;
  const granted = createReserveScanQuotaMiddleware({
    reserveQuota: async () => ({
      granted: true,
      reservationId: "reservation-1",
      used: 0,
      limit: 1,
    }),
    releaseImage: () => {
      releases += 1;
    },
    quotaLogger: { warn() {}, error() {} },
  });
  const request = {
    user: { id: "user-1" },
    scanImage: { buffer: Buffer.from("image") },
  };
  let continued = false;
  await granted(request, responseRecorder().response, () => {
    continued = true;
  });
  assert.equal(continued, true);
  assert.equal(request.scanQuota.reservationId, "reservation-1");
  assert.equal(releases, 0);

  for (const reserveQuota of [
    async () => ({ granted: false, reservationId: null, used: 1, limit: 1 }),
    async () => {
      throw new Error("storage down");
    },
  ]) {
    const middleware = createReserveScanQuotaMiddleware({
      reserveQuota,
      releaseImage: () => {
        releases += 1;
      },
      quotaLogger: { warn() {}, error() {} },
    });
    const response = responseRecorder();
    await middleware(
      { user: { id: "user-1" }, scanImage: { buffer: Buffer.from("image") } },
      response.response,
      () => assert.fail("must reject"),
    );
    assert.ok([403, 503].includes(response.result.statusCode));
  }
  assert.equal(releases, 2);
});

test("atomic reservation skips storage for anonymous requests", async () => {
  let continued = false;
  const middleware = createReserveScanQuotaMiddleware({
    reserveQuota: async () => assert.fail("must not reserve"),
  });
  await middleware({}, responseRecorder().response, () => {
    continued = true;
  });
  assert.equal(continued, true);
});
