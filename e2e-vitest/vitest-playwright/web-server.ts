import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import type { TestProject } from "vitest/node";

/**
 * Start the app under test and provide its URL as `baseURL`, like Playwright
 * Test's `webServer`. Call from global setup, and call the returned function
 * in teardown.
 */
export async function startWebServer(
  project: TestProject,
  {
    command,
    url,
    env,
    timeout = 60_000,
  }: {
    command: string[];
    url: string;
    env?: Record<string, string>;
    timeout?: number;
  },
) {
  const [file, ...args] = command;
  const server = spawn(file!, args, {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  await waitForUrl(url, { timeout });
  project.provide("baseURL", url);
  return async () => {
    server.kill("SIGTERM");
    await once(server, "exit");
  };
}

/** Pick a free local port for a server under test. */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

async function waitForUrl(url: string, { timeout }: { timeout: number }) {
  const deadline = Date.now() + timeout;
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

declare module "vitest" {
  export interface ProvidedContext {
    baseURL: string;
  }
}
