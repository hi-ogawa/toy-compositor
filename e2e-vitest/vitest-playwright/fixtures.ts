import path from "node:path";
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
  request as playwrightRequest,
} from "@playwright/test";
import { inject, recordArtifact, test as base } from "vitest";

// Mirrors Playwright Test's built-in fixtures: a browser shared across tests,
// and a fresh context and page per test. The browser is a connection per file
// to the browser server from global setup.
export const test = base
  .extend("browser", { scope: "file" }, async ({}, { onCleanup }) => {
    const browser: Browser = await chromium.connect(inject("wsEndpoint"));
    onCleanup(() => browser.close());
    return browser;
  })
  .extend("context", async ({ browser, task }, { onCleanup }) => {
    const context: BrowserContext = await browser.newContext({
      baseURL: inject("baseURL"),
    });
    // Record a native Playwright trace per test and attach it to the test,
    // in place of Playwright Test's `trace` option. This uses `recordArtifact`
    // because `annotate` is rejected once the test body has finished, which
    // includes fixture cleanup and `onTestFinished`.
    await context.tracing.start({ snapshots: true, sources: true });
    onCleanup(async () => {
      const tracePath = path.resolve(
        ".local/e2e-vitest-traces",
        `${task.id}.zip`,
      );
      await context.tracing.stop({ path: tracePath });
      await recordArtifact(task, {
        type: "playwright:trace",
        attachments: [{ path: tracePath, contentType: "application/zip" }],
      });
      await context.close();
    });
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
  });
