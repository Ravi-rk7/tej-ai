import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeFrontendEvent } from "../src/lib/observability.js";

test("frontend observability removes identity, request data, breadcrumbs, and messages", () => {
  const event = sanitizeFrontendEvent({
    message: "owner@example.com failed",
    user: { email: "owner@example.com" },
    request: { url: "https://example.com/results?id=secret" },
    breadcrumbs: [{ message: "private" }],
    extra: { image: "base64" },
    contexts: { browser: { name: "private" } },
    tags: { errorType: "TypeError", email: "owner@example.com" },
    exception: { values: [{
      type: "TypeError",
      value: "owner@example.com",
      stacktrace: { frames: [{
        filename: "C:\\Users\\owner@example.com\\private-build\\app.js?token=secret",
        context_line: "private source",
      }] },
    }] },
  });

  const serialized = JSON.stringify(event);
  assert.equal(event.tags.errorType, "TypeError");
  assert.equal(event.exception.values[0].stacktrace.frames[0].filename, "app.js");
  assert.equal(Object.hasOwn(event.tags, "email"), false);
  assert.doesNotMatch(serialized, /owner@example|token=secret|private source|private-build/i);
});
