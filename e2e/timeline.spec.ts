import { rm } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import type { Project } from "../src/lib/project.ts";
import { DEFAULT_PIXELS_PER_SECOND } from "../src/lib/timeline.ts";
import { readJson } from "../src/utils/fs.ts";
import {
  dragBy,
  expectInspectorFields,
  getInspectorField,
  seekTimelineByPixels,
  clickTimelineButton,
  test,
} from "./helper";

test("navigate the timeline without editing the project", async ({
  page,
  editor,
}) => {
  // Open the synthetic project.
  await page.goto(editor.url);
  const time = page.getByTestId("timeline-time");

  // Click the render start marker and confirm it opens Composition settings.
  await clickTimelineButton(page, { name: "Render start" });
  await expect(
    page
      .getByTestId("inspector")
      .getByRole("heading", { name: "Composition settings", exact: true }),
  ).toBeVisible();
  await expect(getInspectorField(page, { name: "start" })).toHaveValue("0");

  // Click the locator and confirm the composition video follows the playhead.
  await clickTimelineButton(page, { name: "thumbnail" });
  await expect(time).toContainText("1.500 s");
  const video = page.getByTestId("composition-canvas").locator("video");
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeCloseTo(1.5);

  // Click the ruler at 1.12 s and confirm the playhead snaps to frame 34 (1.133 s).
  await seekTimelineByPixels(page, {
    pixels: 1.12 * DEFAULT_PIXELS_PER_SECOND,
  });
  await expect(time).toContainText("1.133 s");

  // Step one frame forward with ArrowRight and ten frames back with
  // Shift+ArrowLeft, landing on frames 35 (1.167 s) and 25 (0.833 s).
  await page.keyboard.press("ArrowRight");
  await expect(time).toContainText("1.167 s");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(time).toContainText("0.833 s");

  // Step back past the start and confirm the playhead stays at 0.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
  await expect(time).toContainText("0.000 s");
  await page.keyboard.press("ArrowLeft");
  await expect(time).toContainText("0.000 s");

  // Click empty space in the locator row at 5 s, past the markers, and confirm
  // it seeks like the ruler.
  const locatorRow = page
    .getByTestId("editor-timeline")
    .getByRole("button", { name: "Locator row", exact: true });
  const locatorRowBox = (await locatorRow.boundingBox())!;
  await page.mouse.click(
    locatorRowBox.x + 5 * DEFAULT_PIXELS_PER_SECOND,
    locatorRowBox.y + locatorRowBox.height / 2,
  );
  await expect(time).toContainText("5.000 s");

  // Confirm navigation did not mark the project as having unsaved changes.
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});

test("scroll and zoom the timeline with the wheel", async ({
  page,
  editor,
}) => {
  // Open the synthetic project and scroll left past the start, and confirm the
  // viewport stays at 0 so the ruler point 0.5 s in still seeks to 0.5 s.
  await page.goto(editor.url);
  const time = page.getByTestId("timeline-time");
  const ruler = page
    .getByTestId("editor-timeline")
    .getByRole("button", { name: "Timeline ruler", exact: true });
  const box = (await ruler.boundingBox())!;
  const y = box.y + box.height / 2;
  const pointerX = 0.5 * DEFAULT_PIXELS_PER_SECOND;
  await page.mouse.move(box.x + pointerX, y);
  await page.mouse.wheel(0, -500);
  await seekTimelineByPixels(page, { pixels: pointerX });
  await expect(time).toContainText("0.500 s");

  // Scroll right by 1 s at the default zoom, and confirm the same ruler point
  // now seeks to 1.5 s.
  const scrollX = 1 * DEFAULT_PIXELS_PER_SECOND;
  await page.mouse.wheel(0, scrollX);
  await expect(ruler.locator("span").first()).toHaveText("1");
  await seekTimelineByPixels(page, { pixels: pointerX });
  await expect(time).toContainText("1.500 s");

  // Zoom in by 10% with Ctrl+wheel 1.5 s into the viewport, which is 2.5 s.
  // The point under the pointer stays at 2.5 s, and one second to its right
  // at the zoomed scale is 3.5 s.
  const zoomAnchorX = 1.5 * DEFAULT_PIXELS_PER_SECOND;
  const zoomedPixelsPerSecond = 1.1 * DEFAULT_PIXELS_PER_SECOND;
  await page.mouse.move(box.x + zoomAnchorX, y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(ruler.locator("span").first()).toHaveText("2");
  await seekTimelineByPixels(page, { pixels: zoomAnchorX });
  await expect(time).toContainText("2.500 s");
  await seekTimelineByPixels(page, {
    pixels: zoomAnchorX + zoomedPixelsPerSecond,
  });
  await expect(time).toContainText("3.500 s");
});

test("play the composition and step by frames", async ({ page, editor }) => {
  // Open the synthetic project, where the video starts at 0.
  await page.goto(editor.url);
  const time = page.getByTestId("timeline-time");
  const video = page.getByTestId("composition-canvas").locator("video");
  const readPlayhead = async () => parseFloat((await time.textContent())!);
  const { canvas } = await readJson<Project>(editor.projectFile);
  const formatFrameTime = (frame: number) =>
    `${(frame / canvas.fps).toFixed(3)} s`;

  // Play and confirm the playhead advances with the video playing.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect.poll(readPlayhead).toBeGreaterThan(0.5);
  expect(
    await video.evaluate((element: HTMLVideoElement) => element.paused),
  ).toBe(false);

  // Pause with Space and confirm the playhead lands on a frame that the paused
  // video shows.
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  expect(
    await video.evaluate((element: HTMLVideoElement) => element.paused),
  ).toBe(true);
  const pausedFrame = Math.round((await readPlayhead()) * canvas.fps);
  await expect(time).toContainText(formatFrameTime(pausedFrame));
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeCloseTo(pausedFrame / canvas.fps, 2);

  // Step one frame forward, then ten back with Shift.
  await page.keyboard.press("ArrowRight");
  await expect(time).toContainText(formatFrameTime(pausedFrame + 1));
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(time).toContainText(formatFrameTime(pausedFrame - 9));

  // Confirm playback did not mark the project as having unsaved changes.
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});

test("draw audio waveforms in lanes", async ({ page, editor }) => {
  // Open the synthetic project and confirm the audio layer draws a waveform,
  // and the muted video draws its own audio dimmed.
  await page.goto(editor.url);
  const videoWaveform = page
    .getByTestId("timeline-layer-0")
    .getByTestId("timeline-waveform");
  const audioWaveform = page
    .getByTestId("timeline-layer-1")
    .getByTestId("timeline-waveform");
  await expect(audioWaveform).toBeVisible();
  await expect(audioWaveform).not.toHaveAttribute("data-dimmed");
  await expect(videoWaveform).toHaveAttribute("data-dimmed", "true");

  // Select the video and unmute it, and confirm its waveform is no longer dimmed.
  await clickTimelineButton(page, { name: "Test pattern video" });
  await page
    .getByTestId("inspector")
    .getByRole("checkbox", { name: "muted", exact: true })
    .uncheck();
  await expect(videoWaveform).not.toHaveAttribute("data-dimmed");
});

test("move and trim layers on the timeline", async ({ page, editor }) => {
  // Open the synthetic project, where every layer spans 0 to 3 s and the video
  // source is 3 s long.
  await page.goto(editor.url);
  const secondsToPixels = (seconds: number) =>
    seconds * DEFAULT_PIXELS_PER_SECOND;
  const video = page.getByTestId("timeline-layer-0");
  const videoTrimStart = page.getByTestId("timeline-layer-0-trim-start");
  const videoTrimEnd = page.getByTestId("timeline-layer-0-trim-end");

  // Drag the video region 1 s right, a little off the frame grid, and confirm
  // it selects the layer and moves its start to the nearest frame.
  await dragBy(page, video, { deltaX: secondsToPixels(1.01) });
  await expectInspectorFields(page, { start: "1", in: "0", out: "3" });

  // Trim the video's start 0.5 s later, and confirm `in` follows `start` so the
  // source stays in place.
  await dragBy(page, videoTrimStart, { deltaX: secondsToPixels(0.5) });
  await expectInspectorFields(page, { start: "1.5", in: "0.5", out: "3" });

  // Trim the start 1 s earlier, and confirm it stops where the source begins.
  await dragBy(page, videoTrimStart, { deltaX: secondsToPixels(-1) });
  await expectInspectorFields(page, { start: "1", in: "0", out: "3" });

  // Trim the end 1 s earlier, then 2 s later, and confirm it stops where the
  // source ends.
  await dragBy(page, videoTrimEnd, { deltaX: secondsToPixels(-1) });
  await expectInspectorFields(page, { start: "1", in: "0", out: "2" });
  await dragBy(page, videoTrimEnd, { deltaX: secondsToPixels(2) });
  await expectInspectorFields(page, { start: "1", in: "0", out: "3" });

  // Drag the image region 0.5 s right, and confirm its end moves with it.
  const image = page.getByTestId("timeline-layer-2");
  await dragBy(page, image, { deltaX: secondsToPixels(0.5) });
  await expectInspectorFields(page, { start: "0.5", end: "3.5" });

  // Drag it 2 s left, and confirm it stops at the timeline start.
  await dragBy(page, image, { deltaX: secondsToPixels(-2) });
  await expectInspectorFields(page, { start: "0", end: "3" });

  // Trim the image's end 1 s earlier, which changes only its end.
  await dragBy(page, page.getByTestId("timeline-layer-2-trim-end"), {
    deltaX: secondsToPixels(-1),
  });
  await expectInspectorFields(page, { start: "0", end: "2" });

  // Hold a drag of the image 1 s right, and confirm the region previews the
  // move while the inspector keeps the committed start.
  const original = (await image.boundingBox())!;
  const readImageX = async () => (await image.boundingBox())!.x;
  const pointer = await dragBy(page, image, {
    deltaX: secondsToPixels(1),
    release: false,
  });
  await expect.poll(readImageX).toBeCloseTo(original.x + secondsToPixels(1), 0);
  await expectInspectorFields(page, { start: "0", end: "2" });

  // Press Escape, keep dragging, and release, and confirm the move stays
  // cancelled.
  await page.keyboard.press("Escape");
  await expect.poll(readImageX).toBeCloseTo(original.x, 0);
  await page.mouse.move(pointer.x + secondsToPixels(2), pointer.y, {
    steps: 4,
  });
  await page.mouse.up();
  await expect.poll(readImageX).toBeCloseTo(original.x, 0);
  await expectInspectorFields(page, { start: "0", end: "2" });

  // Save and confirm the edits reach the project file.
  await page.getByTestId("editor-save-button").click();
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
  expect(await readJson(editor.projectFile)).toMatchObject({
    layers: [
      { start: 1, in: 0, out: 3 },
      { start: 0, in: 0, out: 3 },
      { start: 0, end: 2 },
      { start: 0, end: 3 },
    ],
  });
});

test("lock a layer whose source is missing", async ({ page, editor }) => {
  // Delete the video's source file, then open the project.
  await rm(path.join(path.dirname(editor.projectFile), "media/video.mp4"));
  await page.goto(editor.url);

  // Confirm the video lane reports the source as unavailable and offers no
  // trim handles, while the audio lane's source still loads.
  const video = page.getByTestId("timeline-layer-0");
  await expect(
    video.getByRole("img", { name: "source unavailable" }),
  ).toBeVisible();
  await expect(page.getByTestId("timeline-layer-0-trim-end")).toHaveCount(0);
  await expect(page.getByTestId("timeline-layer-1-trim-end")).toBeVisible();

  // Drag the video region, and confirm it stays where it was.
  await dragBy(page, video, { deltaX: DEFAULT_PIXELS_PER_SECOND });
  await clickTimelineButton(page, { name: "Test pattern video" });
  await expectInspectorFields(page, { start: "0", in: "0", out: "3" });
});
