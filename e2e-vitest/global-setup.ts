import { execFileSync } from "node:child_process";
import path from "node:path";
import type { TestProject } from "vitest/node";
import {
  getFreePort,
  startBrowserServer,
  startWebServer,
} from "./vitest-playwright/setup.ts";

export default async function setup(project: TestProject) {
  // Config directory for the server's project folder registry, so tests never
  // touch the user's own.
  process.env.TOY_COMPOSITOR_CONFIG_DIR = path.resolve(".local/e2e-config");

  execFileSync("pnpm", ["build"], { stdio: "inherit" });
  const port = await getFreePort();
  const stopWebServer = await startWebServer(project, {
    command: ["node", "dist/server/cli.js", "serve", "--port", String(port)],
    url: `http://localhost:${port}`,
    env: { TOY_COMPOSITOR_NO_FOLDER_DIALOG: "1" },
  });
  const stopBrowserServer = await startBrowserServer(project, {
    channel: "chromium",
  });

  return async () => {
    await stopBrowserServer();
    await stopWebServer();
  };
}
