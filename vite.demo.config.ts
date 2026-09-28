import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Build the editor as a static site over the synthetic sample, with no server.
 * Relative `base` lets it be hosted under any path, such as GitHub Pages.
 */
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), demoProjectFile()],
  build: { outDir: "dist/demo" },
});

/** Swap the server-backed project file module for the static demo one. */
function demoProjectFile(): Plugin {
  const real = path.resolve("src/lib/project-file.ts");
  const demo = path.resolve("src/demo/project-file.ts");
  return {
    name: "demo-project-file",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || importer === demo) {
        return;
      }
      const resolved = await this.resolve(source, importer, options);
      if (resolved?.id === real) {
        return demo;
      }
    },
  };
}
