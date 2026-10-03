import { expect } from "@playwright/test";
import type { Project } from "../src/lib/project.ts";
import { DEFAULT_PIXELS_PER_SECOND } from "../src/lib/timeline.ts";
import { readJson } from "../src/utils/fs.ts";
import {
  commitInspectorField,
  expectImageLoaded,
  expectInspectorFields,
  clickTimelineButton,
  getInspectorField,
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

test("edit a text layer's content and styling and save them", async ({
  page,
  editor,
}) => {
  // Open the synthetic project and select the title text.
  await page.goto(editor.url);
  const canvas = page.getByTestId("composition-canvas");
  await clickTimelineButton(page, { name: "Title text" });
  const inspector = page.getByTestId("inspector");

  // Rewrite the text over three lines and confirm the preview follows on blur,
  // cutting the lines off at the box height as the render does.
  const textField = getInspectorField(page, { name: "text" });
  await expect(textField).toHaveValue("Synthetic\nsample");
  await textField.fill("Edited\nthree\nlines");
  await textField.blur();
  const text = canvas.getByText("Edited\nthree\nlines", { exact: true });
  await expect(text).toBeVisible();
  await expect(text).toHaveCSS("height", "50px");
  await expect(text).toHaveCSS("overflow", "hidden");

  // Align right, restyle the font and color, and confirm the preview follows.
  await inspector
    .getByRole("group", { name: "Text align" })
    .getByRole("button", { name: "right" })
    .click();
  await commitInspectorField(page, { name: "family", value: "DejaVu Serif" });
  await commitInspectorField(page, { name: "size", value: "32" });
  await commitInspectorField(page, { name: "line spacing", value: "4" });
  await inspector
    .getByRole("combobox", { name: "weight", exact: true })
    .selectOption("700");
  await inspector.getByLabel("color", { exact: true }).fill("#ffcc00");
  await expect(text).toHaveCSS("text-align", "right");
  await expect(text).toHaveCSS("font-family", '"DejaVu Serif"');
  await expect(text).toHaveCSS("font-size", "32px");
  await expect(text).toHaveCSS("line-height", `${32 * 1.2 + 4}px`);
  await expect(text).toHaveCSS("font-weight", "700");
  await expect(text).toHaveCSS("color", "rgb(255, 204, 0)");

  // Recolor the outline, then clear its width and confirm the outline is removed.
  await inspector.getByLabel("outline color", { exact: true }).fill("#ff0000");
  await expect(text).toHaveCSS("-webkit-text-stroke-color", "rgb(255, 0, 0)");
  await commitInspectorField(page, { name: "outline width", value: "0" });
  await expect(text).toHaveCSS("-webkit-text-stroke-width", "0px");
  await expect(
    inspector.getByLabel("outline color", { exact: true }),
  ).toBeDisabled();

  // Make the box taller, and confirm the preview follows.
  await commitInspectorField(page, { name: "height", value: "120" });
  await expect(text).toHaveCSS("height", "120px");

  // Save and confirm the edits reach the project file without an outline.
  const save = page.getByTestId("editor-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  const project = await readJson<Project>(editor.projectFile);
  expect(project).toMatchObject({
    layers: [
      {},
      {},
      {},
      {
        text: "Edited\nthree\nlines",
        align: "right",
        font: { family: "DejaVu Serif", size: 32, weight: 700, lineSpacing: 4 },
        color: "#ffcc00",
        box: { x: 420, y: 260, width: 160, height: 120 },
      },
      {},
    ],
  });
  expect(project.layers[3]).not.toHaveProperty("outline");
});

test("edit layer names and a color layer's fill and box, and save them", async ({
  page,
  editor,
}) => {
  // Add a color layer from the Library tab, which starts numbered after the
  // sample's tint, selected, and filling the canvas.
  await page.goto(editor.url);
  await page.getByRole("button", { name: "Add Color", exact: true }).click();
  const fill = page.getByTestId("composition-layer-5").locator("div").first();
  await expect(fill).toHaveCSS("width", "640px");

  // Name the color layer and confirm its lane and the inspector title follow.
  const name = page
    .getByTestId("inspector")
    .getByLabel("name", { exact: true });
  await expect(name).toHaveValue("Color 2");
  await name.fill("Scrim");
  await name.press("Enter");
  await expect(
    page.getByTestId("inspector").getByRole("heading", { name: "Scrim" }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("editor-timeline")
      .getByRole("button", { name: "Scrim color", exact: true }),
  ).toBeVisible();

  // Change the fill color and confirm the preview paints it.
  await page
    .getByTestId("inspector")
    .getByLabel("color", { exact: true })
    .fill("#ff0000");
  await expect(fill).toHaveCSS("background-color", "rgb(255, 0, 0)");

  // Confirm the box starts from the full canvas, and narrow it.
  await expectInspectorFields(page, {
    x: "0",
    y: "0",
    width: "640",
    height: "360",
  });
  await commitInspectorField(page, { name: "width", value: "320" });
  await expect(fill).toHaveCSS("width", "320px");

  // Save and confirm the name, color, and box reach the project file.
  const save = page.getByTestId("editor-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  const project = await readJson<Project>(editor.projectFile);
  expect(project.layers[5]).toEqual({
    name: "Scrim",
    type: "color",
    color: "#ff0000",
    opacity: 0.5,
    start: 0,
    end: 3,
    box: { x: 0, y: 0, width: 320, height: 360 },
  });
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

test("hold a video layer's first and last frames in the preview", async ({
  page,
  editor,
}) => {
  // Open the synthetic project, start the test pattern at 1 s, and confirm
  // it hides at the output start.
  await page.goto(editor.url);
  const video = page.getByTestId("composition-canvas").locator("video");
  const readVideoTime = () =>
    video.evaluate((element: HTMLVideoElement) => element.currentTime);
  await clickTimelineButton(page, { name: "Test pattern video" });
  await commitInspectorField(page, { name: "start", value: "1" });
  await expect(video).toBeHidden();

  // Hold its first frame for 1 s, and confirm the preview shows that frame at
  // the output start and the lane draws the hold beside the unchanged region.
  await commitInspectorField(page, { name: "before", value: "1" });
  await expect(video).toBeVisible();
  await expect.poll(readVideoTime).toBeCloseTo(0);
  const lane = page.getByTestId("timeline-layer-0");
  await expect(lane).toHaveAttribute("title", "1.000–4.000 s");
  await expect(
    page.getByTestId("timeline-layer-0-hold-before"),
  ).toHaveAttribute("title", "hold 0.000–1.000 s");

  // Shorten its source range to 1 s and hold its last frame for 1 s, then seek
  // into that hold and confirm the preview stays at the source range's end.
  await commitInspectorField(page, { name: "out", value: "1" });
  await commitInspectorField(page, { name: "after", value: "1" });
  await expect(lane).toHaveAttribute("title", "1.000–2.000 s");
  await expect(page.getByTestId("timeline-layer-0-hold-after")).toHaveAttribute(
    "title",
    "hold 2.000–3.000 s",
  );
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
      { start: 1, in: 0, out: 1, hold: { before: 1, after: 1 } },
      {},
      {},
      {},
      {},
    ],
  });
});
