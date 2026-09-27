import { defineConfig, devices } from "@playwright/test";

const traceEnabled =
  process.env.E2E_TRACE === "1" ||
  (!process.env.CI && process.env.E2E_TRACE !== "0");

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/report.json" }],
    ["@hiogawa/playwright-trace-pack/reporter"],
    ...(process.env.CI ? [["github"] as const] : []),
  ],
  use: {
    trace: traceEnabled ? { mode: "on", screenshots: false } : "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
});
