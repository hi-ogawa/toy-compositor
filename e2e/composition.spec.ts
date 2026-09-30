import { expect } from "@playwright/test";
import { DEFAULT_PIXELS_PER_SECOND } from "../src/lib/timeline.ts";
import { readJson } from "../src/utils/fs.ts";
import {
  commitInspectorField,
  expectImageLoaded,
  expectInspectorFields,
  clickTimelineButton,
  getInspectorField,
  getProjectPageUrl,
  seekTimelineByPixels,
  test,
} from "./helper";

test("compose the output start, follow inspector edits, and save them", async ({
  page,
  editor,
}) => {
  // Open the synthetic project and confirm the preview composes its visual layers.
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

  // Crop the image sides and confirm it refits inside its box with an outline.
  await clickTimelineButton(page, { name: "Label backdrop image" });
  await expect(canvas.getByLabel("Selected layer outline")).toBeVisible();
  await commitInspectorField(page, { name: "left", value: "0.25" });
  await commitInspectorField(page, { name: "right", value: "0.25" });
  await expect(image.locator("..")).toHaveCSS("left", "460px");
  await expect(image.locator("..")).toHaveCSS("width", "80px");

  // Offset the output start, video start, and trim, and confirm the video seeks
  // to in + time - start.
  await page
    .getByRole("button", { name: "Composition settings", exact: true })
    .click();
  await commitInspectorField(page, { name: "start", value: "1" });
  await clickTimelineButton(page, { name: "Render start" });
  await expect(page.getByTestId("timeline-time")).toContainText("1.000 s");
  await clickTimelineButton(page, { name: "Test pattern video" });
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
  const text = page.getByTestId("composition-layer-3");
  await clickTimelineButton(page, { name: "Title text" });
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
      { start: 2, in: 0.2 },
      {},
      { crop: { left: 0.25, right: 0.25 } },
      { end: 1 },
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
  // Open the synthetic project and open Composition settings from the header.
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

  // Click the ruler at 1.12 s, step one frame, and edit the render end, and
  // confirm each snaps to the new 10 fps grid.
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

test("compose a still project at its output time", async ({ page, editor }) => {
  // Open the still-output sample and seek its video to the requested thumbnail time.
  await page.goto(
    getProjectPageUrl({ dir: editor.projectDir, file: "thumbnail.json" }),
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
  // Open the synthetic project, open Composition settings, and trim the render
  // end so the video range no longer spans every layer.
  await page.goto(editor.url);
  await page
    .getByRole("button", { name: "Composition settings", exact: true })
    .click();
  await commitInspectorField(page, { name: "end", value: "2" });

  // Seek to 1.5 s, switch to a still, and confirm it takes the playhead's
  // frame with a single render marker.
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
