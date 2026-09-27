import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { test } from "./helper";

test("preview synthetic sources and save an inspector edit", async ({
  page,
  editor,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Open the synthetic project and confirm it starts saved.
  await page.goto(editor.url);
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "project.json",
  );
  const save = page.getByTestId("editor-save-button");
  await expect(save).toHaveAttribute("data-status", "saved");
  const layers = page.getByTestId("editor-layer-list");

  // Select the video and confirm its source preview appears.
  await layers
    .getByRole("button", { name: "video video", exact: true })
    .click();
  await expect(page.locator("main video")).toBeVisible();

  // Switch to audio and confirm its preview replaces the video player.
  await layers
    .getByRole("button", { name: "audio audio", exact: true })
    .click();
  await expect(page.locator("main video")).toHaveCount(0);
  await expect(page.locator("main audio")).toBeVisible();

  // Select the image and confirm it loads without making the project dirty.
  await layers
    .getByRole("button", { name: "image image", exact: true })
    .click();
  await expect(page.locator("main audio")).toHaveCount(0);
  const image = page.getByRole("img", { name: "image", exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(save).toHaveAttribute("data-status", "saved");

  // Edit the image position and save the change to the project file.
  const x = page
    .getByTestId("inspector")
    .getByRole("textbox", { name: "x", exact: true });
  await x.fill("400");
  await x.press("Enter");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  const savedProjectJson = JSON.parse(
    await readFile(editor.projectFile, "utf-8"),
  );
  expect(savedProjectJson.layers[2].box.x).toBe(400);

  // Reload the project and confirm the saved position survives.
  await page.reload();
  await layers
    .getByRole("button", { name: "image image", exact: true })
    .click();
  await expect(x).toHaveValue("400");
  await expect(save).toHaveAttribute("data-status", "saved");
  expect(errors).toEqual([]);
});
