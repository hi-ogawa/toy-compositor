import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e-vitest/**/*.test.ts"],
    globalSetup: ["e2e-vitest/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
