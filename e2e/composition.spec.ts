import { expect } from "@playwright/test";
import {
  commitInspectorField,
  expectImageLoaded,
  clickTimelineButton,
  test,
} from "./helper";

test("compose the output start and follow inspector edits", async ({
  page,
  editor,
}) => {
  // Open the synthetic project and confirm the preview composes its visual layers.
  await page.goto(editor.url);
  const canvas = page.getByTestId("composition-canvas");
  const video = canvas.locator("video");
  const image = canvas.getByRole("img", { name: "image", exact: true });
  await expect(video).toBeVisible();
  await expectImageLoaded(image);
  await expect(
    canvas.getByText("Synthetic\nsample", { exact: true }),
  ).toBeVisible();

  // Crop the image sides and confirm it refits inside its box with an outline.
  await clickTimelineButton(page, { name: "image image" });
  await expect(canvas.getByLabel("Selected layer outline")).toBeVisible();
  await commitInspectorField(page, { name: "left", value: "0.25" });
  await commitInspectorField(page, { name: "right", value: "0.25" });
  await expect(image.locator("..")).toHaveCSS("left", "460px");
  await expect(image.locator("..")).toHaveCSS("width", "80px");

  // Offset the output start, video start, and trim, and confirm the video seeks
  // to in + time - start.
  await clickTimelineButton(page, { name: "Render settings" });
  await commitInspectorField(page, { name: "start", value: "1" });
  await clickTimelineButton(page, { name: "Render start" });
  await expect(page.getByTestId("composition-time")).toContainText("1.000 s");
  await clickTimelineButton(page, { name: "video video" });
  await commitInspectorField(page, { name: "start", value: "0.3" });
  await commitInspectorField(page, { name: "in", value: "0.2" });
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeCloseTo(0.9);

  // Start the video after the output start so it hasn't begun on the first frame,
  // and confirm it disappears.
  await commitInspectorField(page, { name: "start", value: "2" });
  await expect(video).toHaveCount(0);

  // End the text at the playhead and confirm it disappears, because its range
  // excludes its end.
  const text = canvas.getByText("Synthetic\nsample", { exact: true });
  await clickTimelineButton(page, { name: "label text" });
  await commitInspectorField(page, { name: "end", value: "1" });
  await expect(text).toHaveCount(0);
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
  await expect(page.getByTestId("composition-time")).toContainText("1.500 s");
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
