import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.E2E_FRONTEND_URL || "https://invalid-staging.example";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "compatibility.spec.js",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  globalSetup: "./e2e/compat-global-setup.js",
  reporter: [["line"], ["html", {
    open: "never",
    outputFolder: "playwright-report/compatibility",
  }]],
  use: {
    baseURL,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "chrome-desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "edge-desktop",
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
    {
      name: "firefox-desktop",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit-desktop",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "android-chromium",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "iphone-webkit",
      use: { ...devices["iPhone 15"] },
    },
  ],
});
