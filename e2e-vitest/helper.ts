import { cp, rm } from "node:fs/promises";
import path from "node:path";
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  chromium,
  expect,
  type Locator,
  type Page,
  request as playwrightRequest,
} from "@playwright/test";
import { inject, test as base, vi } from "vitest";
import { getProjectPageUrl } from "../src/lib/routes.ts";

// Mirrors Playwright Test's built-in fixtures: a browser shared across tests,
// and a fresh context and page per test. The browser is a connection per file
// to the browser server from global setup, since a `worker` fixture lives only
// as long as a file under default isolation.
export const test = base
  .extend("browser", { scope: "file" }, async ({}, { onCleanup }) => {
    const browser: Browser = await chromium.connect(inject("wsEndpoint"));
    onCleanup(() => browser.close());
    return browser;
  })
  .extend("context", async ({ browser }, { onCleanup }) => {
    const context: BrowserContext = await browser.newContext({
      baseURL: inject("baseURL"),
    });
    onCleanup(() => context.close());
    return context;
  })
  .extend("page", async ({ context }) => {
    const page: Page = await context.newPage();
    return page;
  })
  .extend("request", async ({}, { onCleanup }) => {
    const request: APIRequestContext = await playwrightRequest.newContext({
      baseURL: inject("baseURL"),
    });
    onCleanup(() => request.dispose());
    return request;
  })
  .extend("editor", async ({ request, task }) => {
    // Copy the synthetic sample into its own project folder and register it,
    // so each test saves edits independently. Clear it first, so files a
    // previous run added do not carry over.
    const projectDir = path.resolve(".local/e2e-vitest-projects", task.id);
    await rm(projectDir, { recursive: true, force: true });
    await cp("samples/synthetic", projectDir, { recursive: true });
    await registerFolder(request, { directory: projectDir });
    const projectFile = path.join(projectDir, "project.json");
    return {
      projectDir,
      url: getProjectPageUrl({ path: projectFile }),
      projectFile,
    };
  });

/**
 * Register a folder through the server, which runs registry changes in turn.
 * Workers writing the registry file themselves would drop each other's folders.
 */
async function registerFolder(
  request: APIRequestContext,
  { directory }: { directory: string },
) {
  const response = await request.post("/api/rpc/addProjectFolder", {
    data: { path: directory },
  });
  expect(response.ok()).toBe(true);
}

/** Drag a locator from its center, and return where the pointer started. */
export const dragBy = vi.defineHelper(
  async (
    page: Page,
    locator: Locator,
    {
      deltaX = 0,
      deltaY = 0,
      release = true,
    }: { deltaX?: number; deltaY?: number; release?: boolean },
  ) => {
    const bounds = await locator.boundingBox();
    expect(bounds).not.toBeNull();
    const x = bounds!.x + bounds!.width / 2;
    const y = bounds!.y + bounds!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + deltaX, y + deltaY, { steps: 4 });
    if (release) {
      await page.mouse.up();
    }
    return { x, y };
  },
);
