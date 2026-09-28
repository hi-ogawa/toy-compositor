import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Build the editor as a static site over the synthetic sample, with no server. */
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), demoApiClientPlugin()],
  build: { outDir: "dist/demo" },
});

/** Resolve the server-backed API client to the demo one. */
function demoApiClientPlugin(): Plugin {
  const server = path.resolve("src/lib/api-client.ts");
  const demo = path.resolve("src/lib/api-client-demo.ts");
  return {
    name: "demo-api-client",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, options);
      return resolved?.id === server ? demo : undefined;
    },
  };
}
