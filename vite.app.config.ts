import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { NodeHttp1Handler } from "srvx";
import { toNodeHandler } from "srvx/node";
import { defineConfig, type Plugin } from "vite";
import { createEditorHandler, FILES_PREFIX } from "./src/lib/server/api.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), editorFiles()],
});

/** Serve and save files under the repository root during development only. */
function editorFiles(): Plugin {
  return {
    name: "editor-files",
    configureServer(server) {
      const handler = toNodeHandler(
        createEditorHandler({ root: server.config.root }),
      ) as NodeHttp1Handler;
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith(FILES_PREFIX)) {
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
