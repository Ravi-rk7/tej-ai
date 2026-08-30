import assert from "node:assert/strict";
import { readStagingEnvironment } from "./support/staging.js";

export default async function globalSetup() {
  const configuration = readStagingEnvironment();
  const [healthResponse, frontendResponse] = await Promise.all([
    fetch(`${configuration.apiUrl}/api/health`, {
      headers: { Origin: configuration.frontendUrl },
    }),
    fetch(configuration.frontendUrl, { redirect: "manual" }),
  ]);
  assert.equal(healthResponse.status, 200, "Staging API health check failed");
  const health = await healthResponse.json();
  assert.equal(health?.data?.status, "healthy", "Staging API is not healthy");
  assert.equal(
    health?.data?.releaseSha,
    configuration.releaseSha,
    "Backend release SHA does not match E2E_RELEASE_SHA",
  );
  assert.equal(
    frontendResponse.headers.get("x-tejai-release"),
    configuration.releaseSha,
    "Frontend release SHA does not match E2E_RELEASE_SHA",
  );
}
