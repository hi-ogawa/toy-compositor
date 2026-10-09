import { chromium, type LaunchOptions } from "@playwright/test";
import type { TestProject } from "vitest/node";

/**
 * Launch one browser for the whole run and provide its endpoint, as in the
 * Vite playground harness. Test files connect to it, because a `worker`
 * fixture lives only as long as a file under default isolation, and connecting
 * is much cheaper than launching. Call from global setup, and call the
 * returned function in teardown.
 */
export async function startBrowserServer(
  project: TestProject,
  options?: LaunchOptions,
) {
  const browserServer = await chromium.launchServer(options);
  project.provide("wsEndpoint", browserServer.wsEndpoint());
  return () => browserServer.close();
}

declare module "vitest" {
  export interface ProvidedContext {
    wsEndpoint: string;
  }
}
