// Usage: pnpm dev <project.json>
// Starts the editor on one project file.

import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { NodeHttp1Handler } from "srvx";
import { toNodeHandler } from "srvx/node";
import { createServer } from "vite";
import { createEditorHandler } from "./api.ts";

async function main() {
  const [projectFile] = process.argv.slice(2);
  if (!projectFile) {
    console.error("Usage: pnpm dev <project.json>");
    process.exit(1);
  }
  const handler = toNodeHandler(
    createEditorHandler({ projectFile: path.resolve(projectFile) }),
  ) as NodeHttp1Handler;
  const server = await createServer({
    configFile: false,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "editor-api",
        configureServer(server) {
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
      },
    ],
  });
  await server.listen();
  server.printUrls();
  server.bindCLIShortcuts({ print: true });
}

main();
