import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import {
  commitInspectorField,
  dragBy,
  expectImageLoaded,
  getInspectorField,
  seekVideo,
  clickTimelineButton,
  test,
} from "./helper";

test("preview synthetic sources and save an inspector edit", async ({
  page,
  editor,
}) => {
  // Open the synthetic project and confirm it starts saved.
  await page.goto(editor.url);
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "project.json",
  );
  const save = page.getByTestId("editor-save-button");
  await expect(save).toHaveAttribute("data-status", "saved");

  // Select the video and confirm its source preview appears.
  await clickTimelineButton(page, { name: "video video" });
  await expect(page.locator("#source-monitor video")).toBeVisible();

  // Switch to audio and confirm its preview replaces the video player.
  await clickTimelineButton(page, { name: "audio audio" });
  await expect(page.locator("#source-monitor video")).toHaveCount(0);
  await expect(page.locator("#source-monitor audio")).toBeVisible();

  // Select the image and confirm it loads without making the project dirty.
  await clickTimelineButton(page, { name: "image image" });
  await expect(page.locator("#source-monitor audio")).toHaveCount(0);
  const image = page
    .locator("#source-monitor")
    .getByRole("img", { name: "image", exact: true });
  await expect(image).toBeVisible();
  await expectImageLoaded(image);
  await expect(save).toHaveAttribute("data-status", "saved");

  // Edit the image position and save the change to the project file.
  await commitInspectorField(page, { name: "x", value: "400" });
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  const savedProjectJson = JSON.parse(
    await readFile(editor.projectFile, "utf-8"),
  );
  expect(savedProjectJson.layers[2].box.x).toBe(400);

  // Reload the project and confirm the saved position survives.
  await page.reload();
  await clickTimelineButton(page, { name: "image image" });
  await expect(getInspectorField(page, { name: "x" })).toHaveValue("400");
  await expect(save).toHaveAttribute("data-status", "saved");
});

test("resize and close the source panel without changing the project", async ({
  page,
  editor,
}) => {
  // Open a video source and seek independently of project timing.
  await page.goto(editor.url);
  await clickTimelineButton(page, { name: "video video" });
  const source = page.locator("#source-monitor video");
  await seekVideo({ video: source, time: 1 });

  // Drag the split to resize the source panel.
  const split = page.getByTitle("Resize source panel");
  const sourcePanel = page.locator("#source-monitor");
  const initialWidth = (await sourcePanel.boundingBox())!.width;
  await dragBy({ page, locator: split, deltaX: 100 });
  const resizedWidth = (await sourcePanel.boundingBox())!.width;
  expect(resizedWidth).toBeGreaterThan(initialWidth);

  // Close and reopen Source while preserving the split and save status.
  const toggle = page.getByRole("button", {
    name: "Close source panel",
    exact: true,
  });
  const before = await toggle.boundingBox();
  await toggle.click();
  await expect(source).toHaveCount(0);
  const show = page.getByRole("button", {
    name: "Open source panel",
    exact: true,
  });
  expect((await show.boundingBox())!.x).toBe(before!.x);
  await show.click();
  expect((await sourcePanel.boundingBox())!.width).toBe(resizedWidth);
  await expect(source).toBeVisible();
  await expect
    .poll(() => source.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBe(0);
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});
