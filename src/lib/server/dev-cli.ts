// Usage: pnpm dev <project.json>
// Starts the editor on one project file.

import path from "node:path";
import { createServer } from "vite";
import { editorApi } from "./api.ts";

async function main() {
  const [projectFile] = process.argv.slice(2);
  if (!projectFile) {
    console.error("Usage: pnpm dev <project.json>");
    process.exit(1);
  }
  const server = await createServer({
    configFile: "vite.app.config.ts",
    plugins: [editorApi({ projectFile: path.resolve(projectFile) })],
  });
  await server.listen();
  server.printUrls();
  server.bindCLIShortcuts({ print: true });
}

main();
