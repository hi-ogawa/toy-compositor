import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    printWidth: 80,
    sortImports: {
      newlinesBetween: false,
      partitionByNewline: true,
      groups: [["builtin"], ["external"]],
    },
  },
  lint: {
    categories: {
      correctness: "off",
    },
    rules: {
      curly: "error",
    },
  },
  pack: {
    entry: { cli: "src/cli.ts" },
    // The client build already occupies dist/client.
    clean: false,
    fixedExtension: false,
    platform: "node",
    target: "node24",
  },
  staged: {
    "*": "vp check --fix",
  },
});
