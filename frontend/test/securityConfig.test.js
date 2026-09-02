import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import nextConfig, { buildReleaseHeader, resolveReleaseSha } from "../next.config.mjs";

test("frontend security headers constrain frames, objects, connections, and browser capabilities", async () => {
  const entries = await nextConfig.headers();
  const headers = Object.fromEntries(
    entries[0].headers.map(({ key, value }) => [key.toLowerCase(), value]),
  );

  assert.match(headers["content-security-policy"], /object-src 'none'/);
  assert.match(headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.match(headers["content-security-policy"], /connect-src 'self' http:\/\/localhost:3001 http:\/\/localhost:54321/);
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.match(headers["permissions-policy"], /camera=\(\)/);
});

test("fonts are emitted by next/font without a runtime Google Fonts request", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const layout = await readFile(new URL("../src/app/layout.js", import.meta.url), "utf8");

  assert.doesNotMatch(css, /fonts\.googleapis\.com/);
  assert.match(css, /var\(--font-inter\)/);
  assert.match(layout, /next\/font\/google/);
});

test("release headers expose only bounded Git commit identifiers", () => {
  assert.deepEqual(buildReleaseHeader("abcdef123456"), {
    key: "X-TejAI-Release",
    value: "abcdef123456",
  });
  assert.equal(buildReleaseHeader(""), null);
  assert.throws(() => buildReleaseHeader("not-a-release"), /commit SHA/);
});

test("release identity falls back to Vercel's immutable Git commit", () => {
  assert.equal(resolveReleaseSha({
    NEXT_PUBLIC_RELEASE_SHA: "explicit123",
    VERCEL_GIT_COMMIT_SHA: "vercel456",
  }), "explicit123");
  assert.equal(resolveReleaseSha({ VERCEL_GIT_COMMIT_SHA: "vercel456" }), "vercel456");
  assert.equal(resolveReleaseSha({}), "");
});
