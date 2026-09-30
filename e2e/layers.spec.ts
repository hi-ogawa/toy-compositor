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
  await expect(page.getByTestId("timeline-layer-4")).toBeVisible();
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

  // Add the built-in text and color layers.
  await page.getByRole("button", { name: "Add Text", exact: true }).click();
  await page.getByRole("button", { name: "Add Color", exact: true }).click();
  await expect(page.getByTestId("timeline-layer-7")).toBeVisible();

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
  await expect(page.getByTestId("timeline-layer-8")).toBeVisible();

  // Select the added video from its lane, then save, and confirm the new layers
  // reach the file on top of the existing four, without runtime ids, the
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
  expect(project.layers.slice(4)).toEqual([
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
      type: "text",
      text: "Text",
      box: { x: 64, y: 144, width: 512 },
      align: "center",
      font: { family: "Noto Sans", size: 36 },
      color: "#ffffff",
      start: 0,
      end: 3,
    },
    { type: "color", color: "#000000", opacity: 0.5, start: 0, end: 3 },
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

  // Select the audio and remove it with Backspace, then play for a moment
  // with the remaining layers.
  await clickTimelineButton(page, { name: "Tone 660 Hz audio" });
  await page.keyboard.press("Backspace");
  await expect(
    lanes.getByRole("button", { name: "Tone 660 Hz audio" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("timeline-time")).not.toHaveText("0.000 s");
  await page.getByRole("button", { name: "Pause", exact: true }).click();

  // Save and confirm the file keeps only the video and the image.
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
  ]);
});
