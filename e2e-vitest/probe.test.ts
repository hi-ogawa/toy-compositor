import { describe, expect as vitestExpect } from "vitest";
import { test } from "./helper.ts";
import { expect } from "./vitest-playwright/index.ts";

// Deliberately failing probes of how Playwright Test's standalone `expect`
// behaves under Vitest. Run with `E2E_PROBE=1` and read the failure output.
describe.skipIf(!process.env.E2E_PROBE)("playwright expect probes", () => {
  // Expect a Playwright-formatted message, and a code frame at the matcher call.
  test("locator assertion failure", async ({ page, editor }) => {
    await page.goto(editor.url);
    await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
      "data-status",
      "dirty",
      { timeout: 1000 },
    );
  });

  // Expect the test to continue after the soft failure, and print the marker.
  test("soft assertion", async ({ page, editor }) => {
    await page.goto(editor.url);
    await expect
      .soft(page.getByTestId("editor-save-button"))
      .toHaveAttribute("data-status", "dirty", { timeout: 500 });
    console.log("AFTER_SOFT_REACHED");
  });

  // Expect the Playwright assertion to count toward `expect.assertions`.
  test("assertion count", async ({ page, editor }) => {
    vitestExpect.assertions(1);
    await page.goto(editor.url);
    await expect(page.getByTestId("editor-save-button")).toBeVisible();
  });
});
