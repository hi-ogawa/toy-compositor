import { expect } from "@playwright/test";
import { DEFAULT_PIXELS_PER_SECOND } from "../src/lib/timeline.ts";
import { readJson } from "../src/utils/fs.ts";
import {
  clickCanvasAt,
  commitInspectorField,
  dragCanvasBy,
  expectImageLoaded,
  expectInspectorFields,
  expectInspectorTitle,
  clickTimelineButton,
  getInspectorField,
  seekTimelineByPixels,
  test,
} from "./helper";

test("compose the output start, follow inspector edits, and save them", async ({
  page,
  editor,
}) => {
  // Open the project and confirm the preview composes its visual layers.
  await page.goto(editor.url);
  const canvas = page.getByTestId("composition-canvas");
  const video = canvas.locator("video");
  const image = canvas.getByRole("img", {
    name: "Label backdrop",
    exact: true,
  });
  await expect(video).toBeVisible();
  await expectImageLoaded(image);
  await expect(
    canvas.getByText("Synthetic\nsample", { exact: true }),
  ).toBeVisible();

  // Crop the image sides and confirm the crop hides its edges without moving
  // the rest, with an outline.
  await clickTimelineButton(page, { name: "Select Label backdrop region" });
  await expect(canvas.getByLabel("Selected layer outline")).toBeVisible();
  await commitInspectorField(page, { name: "left", value: "0.25" });
  await commitInspectorField(page, { name: "right", value: "0.25" });
  await expect(image.locator("..")).toHaveCSS("left", "460px");
  await expect(image.locator("..")).toHaveCSS("width", "80px");

  // Offset the output start, video start, and trim, and confirm the video seeks
  // to the matching source time.
  await page
    .getByRole("button", { name: "Composition settings", exact: true })
    .click();
  await commitInspectorField(page, { name: "start", value: "1" });
  await clickTimelineButton(page, { name: "Render start" });
  await expect(page.getByTestId("timeline-time")).toContainText("1.000 s");
  await clickTimelineButton(page, { name: "Select Test pattern region" });
  await commitInspectorField(page, { name: "start", value: "0.3" });
  await commitInspectorField(page, { name: "in", value: "0.2" });
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeCloseTo(0.9);

  // Start the video after the output start so it hasn't begun on the first frame,
  // and confirm it hides.
  await commitInspectorField(page, { name: "start", value: "2" });
  await expect(video).toBeHidden();

  // End the text at the playhead and confirm it hides, because its range
  // excludes its end.
  const text = page.getByTestId("composition-layer-3-clip-0");
  await clickTimelineButton(page, { name: "Select Title region" });
  await commitInspectorField(page, { name: "end", value: "1" });
  await expect(text).toBeHidden();

  // Save the edits and confirm they reach the project file.
  const save = page.getByTestId("editor-save-button");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  expect(await readJson(editor.projectFile)).toMatchObject({
    output: { start: 1 },
    layers: [
      { clips: [{ start: 2, in: 0.2 }] },
      {},
      { clips: [{ crop: { left: 0.25, right: 0.25 } }] },
      { clips: [{ end: 1 }] },
      {},
    ],
  });

  // Reload the project, return to the output start, and confirm the saved edits
  // compose the same frame.
  await page.reload();
  await clickTimelineButton(page, { name: "Render start" });
  await expect(page.getByTestId("timeline-time")).toContainText("1.000 s");
  await expectImageLoaded(image);
  await expect(image.locator("..")).toHaveCSS("left", "460px");
  await expect(image.locator("..")).toHaveCSS("width", "80px");
  await expect(video).toBeHidden();
  await expect(text).toBeHidden();
  await expect(save).toHaveAttribute("data-status", "saved");
});

test("edit the canvas in composition settings and save it", async ({
  page,
  editor,
}) => {
  // Open the project and open Composition settings from the header.
  await page.goto(editor.url);
  const canvas = page.getByTestId("composition-canvas");
  await page
    .getByRole("button", { name: "Composition settings", exact: true })
    .click();
  const readout = page.getByTestId("composition-readout");
  await expect(readout).toHaveText("640 × 360 · 30 fps");

  // Resize the canvas, lower the frame rate, and change the background, and
  // confirm the preview and the Composition readout follow.
  await commitInspectorField(page, { name: "width", value: "800" });
  await commitInspectorField(page, { name: "fps", value: "10" });
  await page
    .getByTestId("inspector")
    .getByLabel("background", { exact: true })
    .fill("#336699");
  await expect(readout).toHaveText("800 × 360 · 10 fps");
  await expect(canvas).toHaveCSS("width", "800px");
  await expect(canvas).toHaveCSS("background-color", "rgb(51, 102, 153)");

  // Click the ruler, step one frame, and edit the render end, and confirm
  // each snaps to the new frame grid.
  const time = page.getByTestId("timeline-time");
  await seekTimelineByPixels(page, {
    pixels: 1.12 * DEFAULT_PIXELS_PER_SECOND,
  });
  await expect(time).toContainText("1.100 s");
  await page.keyboard.press("ArrowRight");
  await expect(time).toContainText("1.200 s");
  await commitInspectorField(page, { name: "end", value: "1.12" });
  await expect(getInspectorField(page, { name: "end" })).toHaveValue("1.1");

  // Save and confirm the canvas and the render end reach the project file.
  const save = page.getByTestId("editor-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  expect(await readJson(editor.projectFile)).toMatchObject({
    canvas: { width: 800, height: 360, fps: 10, background: "#336699" },
    output: { start: 0, end: 1.1 },
  });
});

test("select a clip by clicking it on the composition preview", async ({
  page,
  editor,
}) => {
  // Open the project, where every clip sits over the full-frame video, the tint
  // covers part of its left side, and the title covers a band across the image.
  await page.goto(editor.url);
  const canvas = page.getByTestId("composition-canvas");
  const outline = canvas.getByLabel("Selected layer outline");

  // Click where only the video shows, and select it.
  await clickCanvasAt(page, { x: 100, y: 50 });
  await expect(outline).toBeVisible();
  await expectInspectorTitle(page, { name: "Test pattern" });

  // Click overlapping clips, and select the topmost one under the pointer: the
  // tint over the video, the image above the title's band, and the title over
  // the image.
  await clickCanvasAt(page, { x: 100, y: 150 });
  await expectInspectorTitle(page, { name: "Tint" });
  await clickCanvasAt(page, { x: 450, y: 250 });
  await expectInspectorTitle(page, { name: "Label backdrop" });
  await clickCanvasAt(page, { x: 450, y: 280 });
  await expectInspectorTitle(page, { name: "Title" });

  // Click empty space outside the frame, and clear the selection.
  await clickCanvasAt(page, { x: -20, y: 50 });
  await expect(outline).toHaveCount(0);
});

test("drag a clip to move it on the composition preview", async ({
  page,
  editor,
}) => {
  // Open the project, whose title covers a band across the image.
  await page.goto(editor.url);
  const canvas = page.getByTestId("composition-canvas");
  const image = canvas.getByRole("img", {
    name: "Label backdrop",
    exact: true,
  });
  const placed = image.locator("..");

  // Drag the unselected image, and see it selected and moving before release.
  await dragCanvasBy(
    page,
    { x: 450, y: 250 },
    { deltaX: 40, deltaY: 20, release: false },
  );
  await expect(placed).toHaveCSS("left", "460px");
  await expect(placed).toHaveCSS("top", "260px");
  await expect(canvas.getByLabel("Selected layer outline")).toBeVisible();
  await expectInspectorTitle(page, { name: "Label backdrop" });
  await page.mouse.up();
  await expectInspectorFields(page, { x: "460", y: "260" });

  // Press Escape mid-drag, and the image returns to where it was.
  await dragCanvasBy(
    page,
    { x: 500, y: 330 },
    { deltaX: 30, deltaY: 10, release: false },
  );
  await expect(placed).toHaveCSS("left", "490px");
  await page.keyboard.press("Escape");
  await expect(placed).toHaveCSS("left", "460px");
  await page.mouse.up();
  await expectInspectorFields(page, { x: "460", y: "260" });

  // Drag from where the title covers the selected image, and move the title,
  // the topmost clip under the pointer, as a click there would select it.
  await dragCanvasBy(page, { x: 470, y: 280 }, { deltaX: -20, deltaY: -10 });
  await expectInspectorTitle(page, { name: "Title" });
  await expectInspectorFields(page, { x: "400", y: "250" });

  // Save, and the project file has both new positions.
  const save = page.getByTestId("editor-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  expect(await readJson(editor.projectFile)).toMatchObject({
    layers: [
      {},
      {},
      { clips: [{ transform: { x: 460, y: 260 } }] },
      { clips: [{ box: { x: 400, y: 250 } }] },
      {},
    ],
  });
});

test("compose a still project at its output time", async ({ page, editor }) => {
  // Open a still-output project and confirm its video seeks to the still's time.
  await page.goto(
    `/?${new URLSearchParams({ project: `${editor.projectDir}/thumbnail.json` })}`,
  );
  const video = page.getByTestId("composition-canvas").locator("video");
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeCloseTo(1.5);
  await expect(page.getByTestId("timeline-time")).toContainText("1.500 s");
  await expect(
    page.getByTestId("editor-timeline").getByRole("button", {
      name: "Render frame",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});

test("switch the output between video and still", async ({ page, editor }) => {
  // Open the project, open Composition settings, and trim the render end so
  // the video range no longer spans every layer.
  await page.goto(editor.url);
  await page
    .getByRole("button", { name: "Composition settings", exact: true })
    .click();
  await commitInspectorField(page, { name: "end", value: "2" });

  // Seek, switch to a still, and confirm it takes the playhead's frame with a
  // single render marker.
  const outputType = page.getByRole("group", { name: "Output type" });
  await seekTimelineByPixels(page, {
    pixels: 1.5 * DEFAULT_PIXELS_PER_SECOND,
  });
  await expect(page.getByTestId("timeline-time")).toContainText("1.500 s");
  await outputType.getByRole("button", { name: "still" }).click();
  await expect(
    outputType.getByRole("button", { name: "still" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expectInspectorFields(page, { time: "1.5" });
  const timeline = page.getByTestId("editor-timeline");
  await expect(
    timeline.getByRole("button", { name: "Render frame", exact: true }),
  ).toBeVisible();

  // Switch back to a video and confirm it spans every layer rather than the
  // earlier trimmed range.
  await outputType.getByRole("button", { name: "video" }).click();
  await expectInspectorFields(page, { start: "0", end: "3" });
  await expect(
    timeline.getByRole("button", { name: "Render end", exact: true }),
  ).toBeVisible();

  // Switch to a still again, save, and confirm the still output reaches the
  // project file.
  await outputType.getByRole("button", { name: "still" }).click();
  const save = page.getByTestId("editor-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  expect(await readJson(editor.projectFile)).toMatchObject({
    output: { type: "still", time: 1.5 },
  });
});

test("hold a video layer's first and last frames in the preview", async ({
  page,
  editor,
}) => {
  // Open the project, start the video later, and confirm it hides at the
  // output start.
  await page.goto(editor.url);
  const video = page.getByTestId("composition-canvas").locator("video");
  const readVideoTime = () =>
    video.evaluate((element: HTMLVideoElement) => element.currentTime);
  await clickTimelineButton(page, { name: "Select Test pattern region" });
  await commitInspectorField(page, { name: "start", value: "1" });
  await expect(video).toBeHidden();

  // Hold its first frame, and confirm the preview shows that frame at the
  // output start and the lane draws the hold beside the unchanged region.
  await commitInspectorField(page, { name: "before", value: "1" });
  await expect(video).toBeVisible();
  await expect.poll(readVideoTime).toBeCloseTo(0);
  const lane = page.getByTestId("timeline-layer-0-clip-0");
  await expect(lane).toHaveAttribute("title", "1.000–4.000 s");
  await expect(
    page.getByTestId("timeline-layer-0-clip-0-hold-before"),
  ).toHaveAttribute("title", "hold 0.000–1.000 s");

  // Shorten its source range and hold its last frame, then seek into that
  // hold and confirm the preview stays at the source range's end.
  await commitInspectorField(page, { name: "out", value: "1" });
  await commitInspectorField(page, { name: "after", value: "1" });
  await expect(lane).toHaveAttribute("title", "1.000–2.000 s");
  await expect(
    page.getByTestId("timeline-layer-0-clip-0-hold-after"),
  ).toHaveAttribute("title", "hold 2.000–3.000 s");
  await seekTimelineByPixels(page, {
    pixels: 2.5 * DEFAULT_PIXELS_PER_SECOND,
  });
  await expect(page.getByTestId("timeline-time")).toContainText("2.500 s");
  await expect(video).toBeVisible();
  await expect.poll(readVideoTime).toBeCloseTo(1);

  // Save and confirm the hold reaches the project file.
  const save = page.getByTestId("editor-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  expect(await readJson(editor.projectFile)).toMatchObject({
    layers: [
      { clips: [{ start: 1, in: 0, out: 1, hold: { before: 1, after: 1 } }] },
      {},
      {},
      {},
      {},
    ],
  });
});

test("show the video frame nearest the source time in the preview, as the render does", async ({
  page,
  editor,
}) => {
  // Start the 30fps video at frame 2, which the project stores rounded up to
  // 0.067s.
  await page.goto(editor.url);
  const video = page.getByTestId("composition-canvas").locator("video");
  await clickTimelineButton(page, { name: "Select Test pattern region" });
  await commitInspectorField(page, { name: "start", value: "0.067" });

  // Seek to frame 31, stored rounded down to 1.033s, so the source time is
  // 0.966s, a hair before source frame 29. Confirm the paused video shows
  // frame 29, the nearest one, rather than frame 28, the last one at or
  // before the source time.
  await seekTimelineByPixels(page, {
    pixels: 1.033 * DEFAULT_PIXELS_PER_SECOND,
  });
  await expect(page.getByTestId("timeline-time")).toContainText("1.033 s");
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) =>
        Math.floor(element.currentTime * 30),
      ),
    )
    .toBe(29);
});
