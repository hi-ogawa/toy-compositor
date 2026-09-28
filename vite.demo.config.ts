import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Build the editor as a static site over the synthetic sample, with no server. */
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), demoProjectFilePlugin()],
  build: { outDir: "dist/demo" },
});

/** Resolve the server-backed project file module to the demo one. */
function demoProjectFilePlugin(): Plugin {
  const server = path.resolve("src/lib/project-file.ts");
  const demo = path.resolve("src/lib/project-file-demo.ts");
  return {
    name: "demo-project-file",
    enforce: "pre",
    async resolveId(source, importer, options) {
      // The demo module reuses the URL helper from the original.
      if (importer === demo) {
        return;
      }
      const resolved = await this.resolve(source, importer, options);
      return resolved?.id === server ? demo : undefined;
    },
  };
}
