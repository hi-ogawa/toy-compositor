import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { chromium } from "@playwright/test";
import type { TestProject } from "vitest/node";

// Stand-in for Playwright Test's `webServer`, plus one browser server shared by
// every test file through `provide`, as in the Vite playground harness.
export default async function setup(project: TestProject) {
  // Config directory for the server's project folder registry, so tests never
  // touch the user's own.
  const configDir = path.resolve(".local/e2e-config");
  process.env.TOY_COMPOSITOR_CONFIG_DIR = configDir;

  execFileSync("pnpm", ["build"], { stdio: "inherit" });
  const port = await getFreePort();
  const server = spawn(
    "node",
    ["dist/server/cli.js", "serve", "--port", String(port)],
    {
      env: { ...process.env, TOY_COMPOSITOR_NO_FOLDER_DIALOG: "1" },
      stdio: "inherit",
    },
  );
  const baseURL = `http://localhost:${port}`;
  await waitForUrl(baseURL);

  const browserServer = await chromium.launchServer({ channel: "chromium" });

  project.provide("baseURL", baseURL);
  project.provide("wsEndpoint", browserServer.wsEndpoint());

  return async () => {
    await browserServer.close();
    server.kill("SIGTERM");
    await once(server, "exit");
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    baseURL: string;
    wsEndpoint: string;
  }
}

async function waitForUrl(url: string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server did not start at ${url}`);
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}
