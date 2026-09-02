import assert from "node:assert/strict";
import { readCompatibilityEnvironment } from "./support/staging.js";

export default async function compatibilityGlobalSetup() {
  const configuration = readCompatibilityEnvironment();
  const [healthResponse, readinessResponse, frontendResponse] = await Promise.all([
    fetch(`${configuration.apiUrl}/api/health`, {
      headers: { Origin: configuration.frontendUrl },
    }),
    fetch(`${configuration.apiUrl}/api/ready`, {
      headers: { Origin: configuration.frontendUrl },
    }),
    fetch(configuration.frontendUrl, { redirect: "manual" }),
  ]);

  assert.equal(healthResponse.status, 200, "Staging API health check failed");
  assert.equal(readinessResponse.status, 200, "Staging API readiness check failed");
  const health = await healthResponse.json();
  const readiness = await readinessResponse.json();
  assert.equal(health?.data?.status, "healthy", "Staging API is not healthy");
  assert.equal(readiness?.data?.status, "ready", "Staging API is not ready");
  assert.equal(
    health?.data?.releaseSha,
    configuration.releaseSha,
    "Backend release SHA does not match E2E_RELEASE_SHA",
  );
  assert.equal(
    readiness?.data?.releaseSha,
    configuration.releaseSha,
    "Ready backend release SHA does not match E2E_RELEASE_SHA",
  );
  assert.equal(
    frontendResponse.headers.get("x-tejai-release"),
    configuration.releaseSha,
    "Frontend release SHA does not match E2E_RELEASE_SHA",
  );
}
