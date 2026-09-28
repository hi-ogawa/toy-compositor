import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  // The client build already occupies dist/client.
  clean: false,
  fixedExtension: false,
  platform: "node",
  target: "node24",
});
