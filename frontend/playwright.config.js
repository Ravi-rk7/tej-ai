import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.E2E_FRONTEND_URL || "https://invalid-staging.example";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "compatibility.spec.js",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  globalSetup: "./e2e/global-setup.js",
  reporter: [["line"], ["html", {
    open: "never",
    outputFolder: "playwright-report/release",
  }]],
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "off",
    trace: "off",
    video: "off",
    ...devices["Desktop Chrome"],
  },
});
