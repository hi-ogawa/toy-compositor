import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { NodeHttp1Handler } from "srvx";
import { toNodeHandler } from "srvx/node";
import { defineConfig, type Plugin } from "vite";
import { createEditorHandler } from "./src/lib/server/api.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), editorApi()],
});

/** Serve the editor API over the repository root during development only. */
function editorApi(): Plugin {
  return {
    name: "editor-api",
    configureServer(server) {
      const handler = toNodeHandler(
        createEditorHandler({ root: server.config.root }),
      ) as NodeHttp1Handler;
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) {
          next();
          return;
        }
        try {
          await handler(req, res);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
