import { expect } from "@playwright/test";
import { readJson } from "../src/utils/fs.ts";
import {
  commitInspectorField,
  expectImageLoaded,
  clickTimelineButton,
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
    .getByRole("button", { name: "Render settings", exact: true })
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
