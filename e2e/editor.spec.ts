import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import {
  commitInspectorField,
  dragBy,
  expectImageLoaded,
  getInspectorField,
  seekVideo,
  selectLayer,
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
  await selectLayer(page, { name: "video video" });
  await expect(page.locator("#source-monitor video")).toBeVisible();

  // Switch to audio and confirm its preview replaces the video player.
  await selectLayer(page, { name: "audio audio" });
  await expect(page.locator("#source-monitor video")).toHaveCount(0);
  await expect(page.locator("#source-monitor audio")).toBeVisible();

  // Select the image and confirm it loads without making the project dirty.
  await selectLayer(page, { name: "image image" });
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
  await selectLayer(page, { name: "image image" });
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
  await selectLayer(page, { name: "image image" });
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
  await selectLayer(page, { name: "video video" });
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
  await selectLayer(page, { name: "image image" });
  await expect(canvas.getByLabel("Selected layer outline")).toBeVisible();
  await commitInspectorField(page, { name: "left", value: "0.25" });
  await commitInspectorField(page, { name: "right", value: "0.25" });
  await expect(image.locator("..")).toHaveCSS("left", "460px");
  await expect(image.locator("..")).toHaveCSS("width", "80px");

  // Offset the output start, video start, and trim, and confirm the video seeks
  // to in + time - start.
  await selectLayer(page, { name: "Render settings" });
  await commitInspectorField(page, { name: "start", value: "1" });
  await selectLayer(page, { name: "Render start" });
  await expect(page.getByTestId("composition-time")).toContainText("1.000 s");
  await selectLayer(page, { name: "video video" });
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

test("select lanes and seek the composition without editing the project", async ({
  page,
  editor,
}) => {
  // Open offset and trimmed layers with an output range and a named locator.
  const project = JSON.parse(await readFile(editor.projectFile, "utf-8"));
  project.output.start = 0.5;
  project.layers[0].start = 0.5;
  project.layers[0].in = 0.25;
  project.locators = [{ label: "thumbnail", time: 1.5 }];
  await writeFile(editor.projectFile, JSON.stringify(project));
  const original = await readFile(editor.projectFile, "utf-8");
  await page.goto(editor.url);
  const timeline = page.getByTestId("editor-timeline");
  await expect(page.getByTestId("timeline-time")).toContainText("0.500 s");
  await expect(
    timeline.getByRole("button", { name: "Render start", exact: true }),
  ).toBeVisible();
  await expect(
    timeline.getByRole("button", { name: "Render end", exact: true }),
  ).toBeVisible();
  await expect(
    timeline.getByRole("button", { name: "Output", exact: true }),
  ).toHaveCount(0);
  await timeline
    .getByRole("button", { name: "Render start", exact: true })
    .click();
  await expect(
    page
      .getByTestId("inspector")
      .getByRole("heading", { name: "Render settings", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("inspector")
      .getByRole("textbox", { name: "start", exact: true }),
  ).toHaveValue("0.5");

  await expect(page.getByTestId("timeline-layer-0")).toHaveAttribute(
    "title",
    "0.500–3.250 s",
  );

  // Select a lane and seek through a locator while leaving its source player independent.
  await timeline
    .getByRole("button", { name: "video video", exact: true })
    .click();
  const source = page.locator("#source-monitor video");
  await expect
    .poll(() => source.evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  await source.evaluate((video: HTMLVideoElement) => {
    video.currentTime = 0.4;
  });
  await timeline
    .getByRole("button", { name: "thumbnail", exact: true })
    .click();
  const composition = page.getByTestId("composition-canvas").locator("video");
  await expect
    .poll(() =>
      composition.evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeCloseTo(1.25);
  await expect
    .poll(() => source.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(0.4);

  // Seek on the ruler and confirm the requested project time snaps to a frame.
  const ruler = timeline.getByRole("button", {
    name: "Timeline ruler",
    exact: true,
  });
  const bounds = (await ruler.boundingBox())!;
  const region = (await page.getByTestId("timeline-layer-0").boundingBox())!;
  const pixelsPerSecond = region.width / 2.75;
  await ruler.click({
    position: { x: 1.12 * pixelsPerSecond, y: bounds.height / 2 },
  });
  await expect(page.getByTestId("timeline-time")).toContainText("1.133 s");
  await expect
    .poll(() =>
      composition.evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeCloseTo(0.883);

  // Zoom and scroll the timeline while its lane labels and current project state stay intact.
  await timeline
    .getByRole("slider", { name: "Timeline zoom", exact: true })
    .fill("9");
  const scroll = page.getByTestId("timeline-scroll");
  await scroll.evaluate((element) => {
    element.scrollLeft = 150;
  });
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollLeft))
    .toBe(150);
  await expect(
    timeline.getByRole("button", { name: "video video", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("timeline-time")).toContainText("1.133 s");
  // Seek after scrolling and confirm the ruler still maps to project time.
  const scrolledRuler = (await ruler.boundingBox())!;
  await page.mouse.click(
    scrolledRuler.x + 0.5 * 512,
    scrolledRuler.y + scrolledRuler.height / 2,
  );
  await expect(page.getByTestId("timeline-time")).toContainText("0.500 s");
  await expect
    .poll(() =>
      composition.evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeCloseTo(0.25);
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
  expect(await readFile(editor.projectFile, "utf-8")).toBe(original);
});
