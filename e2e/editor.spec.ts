import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import {
  commitInspectorField,
  dragBy,
  expectImageLoaded,
  getInspectorField,
  seekTimeline,
  seekVideo,
  clickTimelineButton,
  test,
} from "./helper";

test("preview synthetic sources and save an inspector edit", async ({
  page,
  editor,
}) => {
  // Open the synthetic project and confirm it starts saved.
  await page.goto(editor.url);
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "project.json",
  );
  const save = page.getByTestId("editor-save-button");
  await expect(save).toHaveAttribute("data-status", "saved");

  // Select the video and confirm its source preview appears.
  await clickTimelineButton(page, { name: "video video" });
  await expect(page.locator("#source-monitor video")).toBeVisible();

  // Switch to audio and confirm its preview replaces the video player.
  await clickTimelineButton(page, { name: "audio audio" });
  await expect(page.locator("#source-monitor video")).toHaveCount(0);
  await expect(page.locator("#source-monitor audio")).toBeVisible();

  // Select the image and confirm it loads without making the project dirty.
  await clickTimelineButton(page, { name: "image image" });
  await expect(page.locator("#source-monitor audio")).toHaveCount(0);
  const image = page
    .locator("#source-monitor")
    .getByRole("img", { name: "image", exact: true });
  await expect(image).toBeVisible();
  await expectImageLoaded(image);
  await expect(save).toHaveAttribute("data-status", "saved");

  // Edit the image position and save the change to the project file.
  await commitInspectorField(page, { name: "x", value: "400" });
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  const savedProjectJson = JSON.parse(
    await readFile(editor.projectFile, "utf-8"),
  );
  expect(savedProjectJson.layers[2].box.x).toBe(400);

  // Reload the project and confirm the saved position survives.
  await page.reload();
  await clickTimelineButton(page, { name: "image image" });
  await expect(getInspectorField(page, { name: "x" })).toHaveValue("400");
  await expect(save).toHaveAttribute("data-status", "saved");
});

test("open projects from the start page", async ({ page, editor }) => {
  const { projectDir } = editor;

  // Open the editor without a project and confirm it lists this test's project
  // directory with its projects.
  await page.goto("/");
  const section = page
    .getByTestId("project-list")
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", { name: projectDir, exact: true }),
    });
  await expect(section.getByRole("link")).toHaveText([
    "project.json640x360 video",
    "thumbnail.json640x360 still",
  ]);

  // Open the thumbnail project from the list.
  await section.getByRole("link", { name: /thumbnail\.json/ }).click();
  await expect(page).toHaveURL(
    `/?${new URLSearchParams({ project: `${projectDir}/thumbnail.json` })}`,
  );
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "thumbnail.json",
  );

  // Select the image and confirm its source resolves relative to the project file.
  await clickTimelineButton(page, { name: "image image" });
  const image = page
    .locator("#source-monitor")
    .getByRole("img", { name: "image", exact: true });
  await expectImageLoaded(image);
});

test("resize and close the source panel without changing the project", async ({
  page,
  editor,
}) => {
  // Open a video source and seek independently of project timing.
  await page.goto(editor.url);
  await clickTimelineButton(page, { name: "video video" });
  const source = page.locator("#source-monitor video");
  await seekVideo({ video: source, time: 1 });

  // Drag the split to resize the source panel.
  const split = page.getByTitle("Resize source panel");
  const sourcePanel = page.locator("#source-monitor");
  const initialWidth = (await sourcePanel.boundingBox())!.width;
  await dragBy({ page, locator: split, deltaX: 100 });
  const resizedWidth = (await sourcePanel.boundingBox())!.width;
  expect(resizedWidth).toBeGreaterThan(initialWidth);

  // Close and reopen Source while preserving the split and save status.
  const toggle = page.getByRole("button", {
    name: "Close source panel",
    exact: true,
  });
  const before = await toggle.boundingBox();
  await toggle.click();
  await expect(source).toHaveCount(0);
  const show = page.getByRole("button", {
    name: "Open source panel",
    exact: true,
  });
  expect((await show.boundingBox())!.x).toBe(before!.x);
  await show.click();
  expect((await sourcePanel.boundingBox())!.width).toBe(resizedWidth);
  await expect(source).toBeVisible();
  await expect
    .poll(() => source.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBe(0);
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});

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

test("navigate the timeline without editing the project", async ({
  page,
  editor,
}) => {
  // Open the synthetic project.
  await page.goto(editor.url);
  const time = page.getByTestId("timeline-time");

  // Click the render start marker and confirm it opens Render settings.
  await clickTimelineButton(page, { name: "Render start" });
  await expect(
    page
      .getByTestId("inspector")
      .getByRole("heading", { name: "Render settings", exact: true }),
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
  await seekTimeline(page, { time: 1.12 });
  await expect(time).toContainText("1.133 s");

  // Zoom in, scroll right, click the ruler at 1 s, and confirm the playhead lands there.
  await page
    .getByTestId("editor-timeline")
    .getByRole("slider", { name: "Timeline zoom", exact: true })
    .fill("9");
  await page.getByTestId("timeline-scroll").evaluate((element) => {
    element.scrollLeft = 150;
  });
  await seekTimeline(page, { time: 1 });
  await expect(time).toContainText("1.000 s");

  // Confirm navigation did not mark the project as having unsaved changes.
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});
