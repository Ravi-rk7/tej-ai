import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SCAN_FILE_BYTES,
  inspectScanDimensions,
  validateScanFile,
} from "../src/lib/scanFileValidation.js";

test("accepts only a non-empty JPEG up to 8 MB", () => {
  assert.equal(
    validateScanFile({ type: "image/jpeg", size: MAX_SCAN_FILE_BYTES }),
    null,
  );
  assert.match(
    validateScanFile({ type: "image/png", size: 100 }),
    /Only JPG or JPEG/,
  );
  assert.match(validateScanFile({ type: "image/jpeg", size: 0 }), /empty/);
  assert.match(
    validateScanFile({ type: "image/jpeg", size: MAX_SCAN_FILE_BYTES + 1 }),
    /8 MB/,
  );
});

test("checks decoded dimensions and closes the temporary bitmap", async () => {
  let closed = false;
  const result = await inspectScanDimensions({}, async () => ({
    width: 600,
    height: 500,
    close: () => {
      closed = true;
    },
  }));

  assert.deepEqual(result, {
    width: 600,
    height: 500,
    meetsRecommendation: true,
  });
  assert.equal(closed, true);
});

test("rejects small, oversized, and corrupted decoded images clearly", async () => {
  await assert.rejects(
    inspectScanDimensions({}, async () => ({ width: 199, height: 500 })),
    /at least 200x200px/,
  );
  await assert.rejects(
    inspectScanDimensions({}, async () => ({ width: 8193, height: 500 })),
    /must not exceed 8192px/,
  );
  await assert.rejects(
    inspectScanDimensions({}, async () => {
      throw new Error("decoder details");
    }),
    /corrupted or could not be decoded/,
  );
});

test("allows a valid small canvas with a quality recommendation", async () => {
  const result = await inspectScanDimensions({}, async () => ({
    width: 250,
    height: 300,
  }));

  assert.equal(result.meetsRecommendation, false);
});
