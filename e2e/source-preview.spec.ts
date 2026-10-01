import { expect } from "@playwright/test";
import {
  commitInspectorField,
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

  // Switch to audio and confirm its waveform player replaces the video player.
  await clickTimelineButton(page, { name: "Tone 660 Hz audio" });
  await expect(page.locator("#side-panel video")).toHaveCount(0);
  await expect(page.locator("#side-panel audio")).toBeHidden();
  await expect(page.getByTestId("source-waveform")).toBeVisible();
  await expect(page.getByTestId("source-selected-range")).toBeVisible();

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
  // the split, the Source tab, the source's seek position, and save status.
  await page
    .getByRole("button", { name: "Collapse side panel", exact: true })
    .click();
  await expect(source).toBeHidden();
  await page
    .getByRole("button", { name: "Expand side panel", exact: true })
    .click();
  expect((await sourcePanel.boundingBox())!.width).toBe(resizedWidth);
  await expect(source).toBeVisible();
  await expect
    .poll(() => source.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBe(1);
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});

test("seek source audio and keep its playback separate from the composition", async ({
  page,
  editor,
}) => {
  // Open the audio source player and wait for its shared decoded waveform.
  await page.goto(editor.url);
  await page.getByRole("tab", { name: "Source" }).click();
  await clickTimelineButton(page, { name: "Tone 660 Hz audio" });
  await expect(page.getByTestId("source-waveform")).toBeVisible();
  const audio = page.locator("#side-panel audio");

  // Trim the selected layer and confirm its source interval shades the waveform.
  await commitInspectorField(page, { name: "in", value: "0.6" });
  await commitInspectorField(page, { name: "out", value: "2.4" });
  const selectedRange = page.getByTestId("source-selected-range");
  await expect
    .poll(() => selectedRange.evaluate((element) => element.style.left))
    .toBe("20%");
  await expect
    .poll(() => selectedRange.evaluate((element) => element.style.width))
    .toBe("60%");

  // Click halfway through the waveform and confirm the hidden media element seeks.
  const waveform = page.getByRole("button", { name: "Seek source audio" });
  const bounds = (await waveform.boundingBox())!;
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeCloseTo(1.5, 1);

  // Start composition playback, then start the source and confirm it takes over.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play source audio" }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pause source audio" }),
  ).toBeVisible();

  // Restart the composition and confirm it pauses source playback in reverse.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play source audio" }),
  ).toBeVisible();
});
