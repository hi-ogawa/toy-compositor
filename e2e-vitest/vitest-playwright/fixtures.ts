import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
  request as playwrightRequest,
} from "@playwright/test";
import { inject, test as base } from "vitest";

// Mirrors Playwright Test's built-in fixtures: a browser shared across tests,
// and a fresh context and page per test. The browser is a connection per file
// to the browser server from global setup.
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
  });
