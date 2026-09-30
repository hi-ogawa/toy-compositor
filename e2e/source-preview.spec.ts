import { expect } from "@playwright/test";
import {
  dragBy,
  expectImageLoaded,
  seekVideo,
  clickTimelineButton,
  test,
} from "./helper";

test("preview synthetic sources", async ({ page, editor }) => {
  // Open the synthetic project and confirm it starts saved.
  await page.goto(editor.url);
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "project.json",
  );
  const save = page.getByTestId("editor-save-button");
  await expect(save).toHaveAttribute("data-status", "saved");

  // Switch the side panel to Source, select the video, and confirm its source
  // preview appears.
  await page.getByRole("tab", { name: "Source" }).click();
  await clickTimelineButton(page, { name: "Test pattern video" });
  await expect(page.locator("#side-panel video")).toBeVisible();

  // Switch to audio and confirm its preview replaces the video player.
  await clickTimelineButton(page, { name: "Tone 660 Hz audio" });
  await expect(page.locator("#side-panel video")).toHaveCount(0);
  await expect(page.locator("#side-panel audio")).toBeVisible();

  // Select the image and confirm it loads without making the project dirty.
  await clickTimelineButton(page, { name: "Label backdrop image" });
  await expect(page.locator("#side-panel audio")).toHaveCount(0);
  const image = page
    .locator("#side-panel")
    .getByRole("img", { name: "Label backdrop", exact: true });
  await expect(image).toBeVisible();
  await expectImageLoaded(image);
  await expect(save).toHaveAttribute("data-status", "saved");
});

test("resize and collapse the source panel without changing the project", async ({
  page,
  editor,
}) => {
  // Open a video source and seek independently of project timing.
  await page.goto(editor.url);
  await page.getByRole("tab", { name: "Source" }).click();
  await clickTimelineButton(page, { name: "Test pattern video" });
  const source = page.locator("#side-panel video");
  await seekVideo(source, { time: 1 });

  // Drag the split to resize the source panel.
  const split = page.getByTitle("Resize side panel");
  const sourcePanel = page.locator("#side-panel");
  const initialWidth = (await sourcePanel.boundingBox())!.width;
  await dragBy(page, split, { deltaX: 100 });
  const resizedWidth = (await sourcePanel.boundingBox())!.width;
  expect(resizedWidth).toBeGreaterThan(initialWidth);

  // Collapse the side panel to its edge strip, then expand it while preserving
  // the split, the Source tab, and save status.
  await page
    .getByRole("button", { name: "Collapse side panel", exact: true })
    .click();
  await expect(source).toHaveCount(0);
  await page
    .getByRole("button", { name: "Expand side panel", exact: true })
    .click();
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
