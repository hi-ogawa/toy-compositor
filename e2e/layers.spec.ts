import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import type { Project } from "../src/lib/project.ts";
import { DEFAULT_PIXELS_PER_SECOND } from "../src/lib/timeline.ts";
import { readJson } from "../src/utils/fs.ts";
import {
  expectInspectorFields,
  getInspectorField,
  seekTimelineByPixels,
  clickTimelineButton,
  test,
} from "./helper";

test("add layers from the Library tab", async ({ page, editor }) => {
  // Put a non-media file into the synthetic project's media folder, then open
  // the project, whose output spans 0 to 3 s.
  const mediaDir = path.join(path.dirname(editor.projectFile), "media");
  await writeFile(path.join(mediaDir, "notes.txt"), "not media");
  await page.goto(editor.url);

  // Confirm the Library tab lists only the media files, by name and in order.
  const files = page.getByRole("list", { name: "Media files" });
  await expect(files.getByRole("listitem")).toHaveText([
    /audio\.wav$/,
    /image\.png$/,
    /video\.mp4$/,
  ]);

  // Move the playhead to 1 s and add the video, and confirm it lands on top,
  // selected, playing its whole source from the playhead.
  await seekTimelineByPixels(page, { pixels: DEFAULT_PIXELS_PER_SECOND });
  await page
    .getByRole("button", { name: "Add video.mp4", exact: true })
    .click();
  await expect(page.getByTestId("timeline-layer-5")).toBeVisible();
  await expectInspectorFields(page, {
    start: "1",
    in: "0",
    out: "3",
    x: "0",
    y: "0",
    width: "640",
    height: "360",
  });

  // Add the image, and confirm it spans the output.
  await page
    .getByRole("button", { name: "Add image.png", exact: true })
    .click();
  await expectInspectorFields(page, { start: "0", end: "3" });

  // Add the built-in text and color layers, which take the next number after
  // the sample's own text and color layers.
  await page.getByRole("button", { name: "Add Text", exact: true }).click();
  await page.getByRole("button", { name: "Add Color", exact: true }).click();
  await expect(page.getByTestId("timeline-layer-8")).toBeVisible();

  // Drop a new file into the folder, focus the window as when switching back
  // from the file manager, and confirm the list picks it up.
  await copyFile(
    path.join(mediaDir, "audio.wav"),
    path.join(mediaDir, "extra.wav"),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(files.getByRole("listitem")).toHaveText([
    /audio\.wav$/,
    /extra\.wav$/,
    /image\.png$/,
    /video\.mp4$/,
  ]);

  // Add the new file, which the project has no media info for yet.
  await page
    .getByRole("button", { name: "Add extra.wav", exact: true })
    .click();
  await expect(page.getByTestId("timeline-layer-9")).toBeVisible();

  // Select the added video from its lane, then save, and confirm the new layers
  // reach the file on top of the existing five, without runtime ids, the
  // existing media info is reused as is, and the new file's info is probed.
  await clickTimelineButton(page, { name: "video video" });
  await expectInspectorFields(page, { start: "1" });
  await page.getByTestId("editor-save-button").click();
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
  const project = await readJson<Project>(editor.projectFile);
  const sample = await readJson<Project>("samples/synthetic/project.json");
  expect(project.media).toEqual({
    ...sample.media,
    "media/extra.wav": sample.media["media/audio.wav"],
  });
  expect(project.layers.slice(5)).toEqual([
    {
      name: "video",
      type: "video",
      src: "media/video.mp4",
      start: 1,
      in: 0,
      out: 3,
      box: { x: 0, y: 0, width: 640, height: 360 },
    },
    {
      name: "image",
      type: "image",
      src: "media/image.png",
      box: { x: 0, y: 0, width: 640, height: 360 },
      start: 0,
      end: 3,
    },
    {
      name: "Text 2",
      type: "text",
      text: "Text",
      box: { x: 64, y: 144, width: 512, height: 72 },
      align: "center",
      font: { family: "Noto Sans", size: 36 },
      color: "#ffffff",
      start: 0,
      end: 3,
    },
    {
      name: "Color 2",
      type: "color",
      color: "#000000",
      opacity: 0.5,
      box: { x: 0, y: 0, width: 640, height: 360 },
      start: 0,
      end: 3,
    },
    {
      name: "extra",
      type: "audio",
      src: "media/extra.wav",
      start: 1,
      in: 0,
      out: 3,
    },
  ]);
});

test("remove the selected layer", async ({ page, editor }) => {
  // Open the synthetic project and select the title text layer.
  await page.goto(editor.url);
  const lanes = page.getByTestId("editor-timeline");
  await clickTimelineButton(page, { name: "Title text" });

  // Press Backspace inside an inspector field, and confirm it edits the field
  // instead of removing the layer, then discard the draft with Escape.
  await getInspectorField(page, { name: "start" }).press("Backspace");
  await expect(lanes.getByRole("button", { name: "Title text" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Click the time readout to leave the field, press Delete, and confirm the
  // lane and its inspector go away.
  await page.getByTestId("timeline-time").click();
  await page.keyboard.press("Delete");
  await expect(lanes.getByRole("button", { name: "Title text" })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("inspector")).toHaveCount(0);

  // Select the audio and remove it with Backspace.
  await clickTimelineButton(page, { name: "Tone 660 Hz audio" });
  await page.keyboard.press("Backspace");
  await expect(
    lanes.getByRole("button", { name: "Tone 660 Hz audio" }),
  ).toHaveCount(0);

  // Save and confirm the file keeps only the video, the image, and the tint.
  await page.getByTestId("editor-save-button").click();
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
  const project = await readJson<{ layers: { name: string }[] }>(
    editor.projectFile,
  );
  expect(project.layers.map((layer) => layer.name)).toEqual([
    "Test pattern",
    "Label backdrop",
    "Tint",
  ]);
});

test("move the selected layer up and down in the stack", async ({
  page,
  editor,
}) => {
  // Open the synthetic project, whose stack from the bottom is the video, the
  // audio, the image, the title text, and the tint, and select the image.
  await page.goto(editor.url);
  const regions = page
    .getByTestId("editor-timeline")
    .getByRole("button", { name: /^Select .* region$/ });
  const expectLaneOrder = (names: string[]) =>
    expect
      .poll(() =>
        regions.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("aria-label")),
        ),
      )
      .toEqual(names.map((name) => `Select ${name} region`));
  await expectLaneOrder([
    "Tint",
    "Title",
    "Label backdrop",
    "Tone 660 Hz",
    "Test pattern",
  ]);
  await clickTimelineButton(page, { name: "Label backdrop image" });
  const moveUp = page.getByRole("button", { name: "Move up", exact: true });
  const moveDown = page.getByRole("button", { name: "Move down", exact: true });

  // Move it up twice, and confirm it takes the top lane and draws above the
  // title and the tint while staying selected, with nothing left above it.
  await moveUp.click();
  await moveUp.click();
  await expectLaneOrder([
    "Label backdrop",
    "Tint",
    "Title",
    "Tone 660 Hz",
    "Test pattern",
  ]);
  const top = page.getByTestId("composition-layer-4");
  await expect(top.getByRole("img", { name: "Label backdrop" })).toBeVisible();
  await expect(top.getByLabel("Selected layer outline")).toBeVisible();
  await expect(page.getByTestId("composition-layer-2")).toHaveText(
    "Synthetic sample",
  );
  await expect(moveUp).toBeDisabled();

  // Move it down three times to just above the video, and confirm the
  // inspector still shows it.
  await moveDown.click();
  await moveDown.click();
  await moveDown.click();
  await expectLaneOrder([
    "Tint",
    "Title",
    "Tone 660 Hz",
    "Label backdrop",
    "Test pattern",
  ]);
  await expectInspectorFields(page, { start: "0", end: "3", x: "420" });

  // Move it to the bottom, and confirm nothing is left below it.
  await moveDown.click();
  await expectLaneOrder([
    "Tint",
    "Title",
    "Tone 660 Hz",
    "Test pattern",
    "Label backdrop",
  ]);
  await expect(moveDown).toBeDisabled();

  // Save and confirm the file keeps the new order.
  await page.getByTestId("editor-save-button").click();
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
  const project = await readJson<{ layers: { name: string }[] }>(
    editor.projectFile,
  );
  expect(project.layers.map((layer) => layer.name)).toEqual([
    "Label backdrop",
    "Test pattern",
    "Tone 660 Hz",
    "Title",
    "Tint",
  ]);
});
