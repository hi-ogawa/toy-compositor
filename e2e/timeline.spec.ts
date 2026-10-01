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
  commitInspectorField,
  test,
} from "./helper";

test("navigate the timeline without editing the project", async ({
  page,
  editor,
}) => {
  // Open the synthetic project and confirm the ruler matches the locator row.
  await page.goto(editor.url);
  const timeline = page.getByTestId("editor-timeline");
  const locatorRow = timeline.getByRole("button", {
    name: "Locator row",
    exact: true,
  });
  const ruler = timeline.getByRole("button", {
    name: "Timeline ruler",
    exact: true,
  });
  expect((await ruler.boundingBox())!.height).toBe(
    (await locatorRow.boundingBox())!.height,
  );
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
  await seekTimelineByPixels(page, {
    pixels: 5 * DEFAULT_PIXELS_PER_SECOND,
    name: "Locator row",
  });
  await expect(time).toContainText("5.000 s");

  // Confirm navigation did not mark the project as having unsaved changes.
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});

test("clear the selection with Escape or the locator row", async ({
  page,
  editor,
}) => {
  // Open the synthetic project.
  await page.goto(editor.url);
  const time = page.getByTestId("timeline-time");
  const emptyInspector = page
    .getByRole("complementary", { name: "Inspector" })
    .getByText("Select composition settings or a layer.");
  const video = page.getByTestId("timeline-layer-0");
  const thumbnail = page
    .getByTestId("editor-timeline")
    .getByRole("button", { name: "thumbnail", exact: true });

  // Select the video layer, press Escape, and confirm the inspector empties
  // and Delete no longer removes the layer.
  await video.click();
  await expectInspectorFields(page, { start: "0" });
  await page.keyboard.press("Escape");
  await expect(emptyInspector).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(video).toBeVisible();

  // Hold a drag of the video region, and confirm the first Escape only cancels
  // the drag, and the next one clears the selection.
  await dragBy(page, video, {
    deltaX: DEFAULT_PIXELS_PER_SECOND,
    release: false,
  });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expectInspectorFields(page, { start: "0" });
  await page.keyboard.press("Escape");
  await expect(emptyInspector).toBeVisible();

  // Click the render end marker, which selects the output, then click the
  // ruler at 1 s, and confirm it seeks but keeps the output selected.
  await clickTimelineButton(page, { name: "Render end" });
  await expect(time).toContainText("3.000 s");
  await expect(emptyInspector).toBeHidden();
  await seekTimelineByPixels(page, { pixels: DEFAULT_PIXELS_PER_SECOND });
  await expect(time).toContainText("1.000 s");
  await expect(emptyInspector).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(emptyInspector).toBeVisible();

  // Select the thumbnail locator, then click empty space in the locator row at
  // 5 s, and confirm it deselects the locator and seeks.
  await thumbnail.click();
  await expect(thumbnail).toHaveAttribute("aria-pressed", "true");
  await seekTimelineByPixels(page, {
    pixels: 5 * DEFAULT_PIXELS_PER_SECOND,
    name: "Locator row",
  });
  await expect(time).toContainText("5.000 s");
  await expect(thumbnail).toHaveAttribute("aria-pressed", "false");

  // Select the locator again, press Escape, and confirm it deselects and
  // Delete no longer removes it.
  await thumbnail.click();
  await expect(thumbnail).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(thumbnail).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Delete");
  await expect(thumbnail).toBeVisible();

  // Confirm clearing the selection left the project unchanged.
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

test("add, move, rename, and delete locators", async ({ page, editor }) => {
  // Open the synthetic project and seek to 4 s, past the render end marker.
  await page.goto(editor.url);
  const secondsToPixels = (seconds: number) =>
    seconds * DEFAULT_PIXELS_PER_SECOND;
  const timeline = page.getByTestId("editor-timeline");
  const getMarker = (name: string) =>
    timeline.getByRole("button", { name, exact: true });
  await seekTimelineByPixels(page, { pixels: secondsToPixels(4) });

  // Press L and confirm it adds a numbered locator at the playhead, selected.
  await page.keyboard.press("L");
  const added = getMarker("Locator 2");
  await expect(added).toHaveAttribute("aria-pressed", "true");
  await expect(added).toHaveAttribute("title", /4\.000 s/);

  // Drag it 0.51 s right, and confirm it lands on the nearest frame at 4.5 s.
  await dragBy(page, added, { deltaX: secondsToPixels(0.51) });
  await expect(added).toHaveAttribute("title", /4\.500 s/);

  // Rename it through the prompt.
  page.once("dialog", (dialog) => dialog.accept("shorts"));
  await clickTimelineButton(page, { name: "Rename Locator 2" });
  await expect(getMarker("shorts")).toBeVisible();

  // Select the video layer, then click the thumbnail locator, which takes
  // over the selection and seeks, and delete it without removing the layer.
  await clickTimelineButton(page, { name: "Test pattern video" });
  await clickTimelineButton(page, { name: "thumbnail" });
  await expect(page.getByTestId("timeline-time")).toContainText("1.500 s");
  await expect(getMarker("shorts")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Delete");
  await expect(getMarker("thumbnail")).toHaveCount(0);
  await expect(page.getByTestId("timeline-layer-0")).toBeVisible();

  // Save and confirm the locators reach the project file.
  await page.getByTestId("editor-save-button").click();
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
  expect((await readJson<Project>(editor.projectFile)).locators).toEqual([
    { label: "shorts", time: 4.5 },
  ]);
});

test("drag render markers on the timeline", async ({ page, editor }) => {
  // Open the synthetic project, which renders 0 to 3 s.
  await page.goto(editor.url);
  const secondsToPixels = (seconds: number) =>
    seconds * DEFAULT_PIXELS_PER_SECOND;
  const getMarker = (name: string) =>
    page
      .getByTestId("editor-timeline")
      .getByRole("button", { name, exact: true });

  // Drag render end 1 s left, and confirm it selects the output and moves the
  // end without seeking.
  await dragBy(page, getMarker("Render end"), {
    deltaX: secondsToPixels(-1),
  });
  await expectInspectorFields(page, { start: "0", end: "2" });
  await expect(page.getByTestId("timeline-time")).toContainText("0.000 s");

  // Click render end without dragging, and confirm it still seeks there.
  await clickTimelineButton(page, { name: "Render end" });
  await expect(page.getByTestId("timeline-time")).toContainText("2.000 s");

  // Drag render start 3 s right, and confirm it stops one frame before the end.
  await dragBy(page, getMarker("Render start"), {
    deltaX: secondsToPixels(3),
  });
  await expectInspectorFields(page, { start: "1.967", end: "2" });

  // Reset the start, then drag render end 3 s left, and confirm it stops one
  // frame after the start.
  await commitInspectorField(page, { name: "start", value: "0" });
  await dragBy(page, getMarker("Render end"), {
    deltaX: secondsToPixels(-3),
  });
  await expectInspectorFields(page, { start: "0", end: "0.033" });

  // Switch to a still at 1 s, and drag its render frame 0.51 s right onto the
  // nearest frame.
  await seekTimelineByPixels(page, { pixels: secondsToPixels(1) });
  await page
    .getByTestId("inspector")
    .getByRole("button", { name: "still", exact: true })
    .click();
  await dragBy(page, getMarker("Render frame"), {
    deltaX: secondsToPixels(0.51),
  });
  await expectInspectorFields(page, { time: "1.5" });

  // Save and confirm the output reaches the project file.
  await page.getByTestId("editor-save-button").click();
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
  expect((await readJson<Project>(editor.projectFile)).output).toEqual({
    type: "still",
    time: 1.5,
  });
});
