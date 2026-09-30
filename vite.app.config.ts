import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { NodeHttp1Handler } from "srvx";
import { toNodeHandler } from "srvx/node";
import { defineConfig, type Plugin } from "vite";
import { createEditorHandler } from "./src/lib/server/api.ts";
import { createLiveConnections } from "./src/lib/server/live.ts";
import {
  createProjectRegistry,
  getConfigDir,
} from "./src/lib/server/registry.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), editorApi()],
  builder: {},
  environments: {
    client: {
      build: { outDir: "dist/client" },
    },
    ssr: {
      build: {
        outDir: "dist/server",
        target: "node24",
        rolldownOptions: { input: { cli: "src/cli.ts" } },
      },
    },
  },
});

/**
 * Serve the editor API during development only. It keeps its registry in
 * `.local/config/` unless `TOY_COMPOSITOR_CONFIG_DIR` is set, for example by
 * e2e tests, and registers each folder in `.local/projects/`, where
 * `pnpm setup-sample` puts samples, at startup.
 */
function editorApi(): Plugin {
  return {
    name: "editor-api",
    async configureServer(server) {
      const registry = createProjectRegistry({
        configDir: process.env.TOY_COMPOSITOR_CONFIG_DIR
          ? getConfigDir()
          : path.join(server.config.root, ".local/config"),
      });
      const projectsDir = path.join(server.config.root, ".local/projects");
      const entries = await fs.promises
        .readdir(projectsDir, { withFileTypes: true })
        .catch(() => []);
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          await registry.addFolder(path.join(projectsDir, entry.name));
        }
      }
      const handler = toNodeHandler(
        // Tabs connect to the dev server too, which never exits on its own.
        createEditorHandler({ registry, live: createLiveConnections() }),
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
