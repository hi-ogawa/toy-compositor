import { expect } from "@playwright/test";
import { test } from "./helper";

test("open the editor interaction reference", async ({ page, editor }) => {
  // Open the synthetic project and launch Help & Shortcuts from the editor menu.
  await page.goto(editor.url);
  await page.getByRole("button", { name: "Editor menu", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Help & Shortcuts", exact: true })
    .click();

  // Confirm the dialog lists each interaction section and representative rows.
  const help = page.getByTestId("editor-help");
  await expect(help).toBeVisible();
  for (const section of [
    "Transport",
    "Timeline",
    "Layers",
    "Markers and locators",
    "Inspector",
    "Project",
  ]) {
    await expect(
      help.getByRole("heading", { name: section, exact: true }),
    ).toBeVisible();
  }
  await expect(help).toContainText("Play / pause");
  await expect(help).toContainText("Drag either layer edge");
  await expect(help).toContainText("Hover / select, then click pencil");
  await expect(help).toContainText("Shift + Up / Down");
  await expect(help).toContainText("Ctrl / Cmd + S");

  // Press the add-locator shortcut inside the dialog and confirm it stays open
  // rather than reaching the editor, then close the dialog with Escape.
  await page.keyboard.press("L");
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(
    page.getByTestId("editor-timeline").getByRole("button", {
      name: "Locator 2",
      exact: true,
    }),
  ).toHaveCount(0);
});
