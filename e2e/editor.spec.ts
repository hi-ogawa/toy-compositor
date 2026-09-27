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

test("resize and collapse the source monitor without changing the project", async ({
  page,
  editor,
}) => {
  // Open a video source and seek independently of project timing.
  await page.goto(editor.url);
  await page
    .getByTestId("editor-layer-list")
    .getByRole("button", { name: "video video", exact: true })
    .click();
  const source = page.locator("#source-monitor video");
  await expect
    .poll(() => source.evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  await source.evaluate((video: HTMLVideoElement) => {
    video.currentTime = 1;
  });
  await expect
    .poll(() => source.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(1);

  // Drag the split and nudge it with the keyboard to resize the source panel.
  const split = page.getByRole("separator", {
    name: "Source and composition split",
  });
  const bounds = (await split.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 100, bounds.y + 20);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await split.getAttribute("aria-valuenow")))
    .toBeGreaterThan(35);
  await split.press("Home");
  await split.press("ArrowRight");
  await expect(split).toHaveAttribute("aria-valuenow", "22");

  // Collapse and reopen Source while preserving the split, position, and save status.
  const toggle = page.getByRole("button", { name: "Hide source", exact: true });
  const before = await toggle.boundingBox();
  await toggle.click();
  await expect(source).toBeHidden();
  const show = page.getByRole("button", { name: "Show source", exact: true });
  expect((await show.boundingBox())!.x).toBe(before!.x);
  await show.click();
  await expect(split).toHaveAttribute("aria-valuenow", "22");
  await expect(source).toBeVisible();
  await expect
    .poll(() => source.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(1);
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});
