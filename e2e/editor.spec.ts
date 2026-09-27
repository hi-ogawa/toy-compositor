import { readFile, writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { test } from "./helper";

test("preview synthetic sources and save an inspector edit", async ({
  page,
  editor,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Open the synthetic project and confirm it starts saved.
  await page.goto(editor.url);
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "project.json",
  );
  const save = page.getByTestId("editor-save-button");
  await expect(save).toHaveAttribute("data-status", "saved");
  const layers = page.getByTestId("editor-timeline");

  // Select the video and confirm its source preview appears.
  await layers
    .getByRole("button", { name: "video video", exact: true })
    .click();
  await expect(page.locator("#source-monitor video")).toBeVisible();

  // Switch to audio and confirm its preview replaces the video player.
  await layers
    .getByRole("button", { name: "audio audio", exact: true })
    .click();
  await expect(page.locator("#source-monitor video")).toHaveCount(0);
  await expect(page.locator("#source-monitor audio")).toBeVisible();

  // Select the image and confirm it loads without making the project dirty.
  await layers
    .getByRole("button", { name: "image image", exact: true })
    .click();
  await expect(page.locator("#source-monitor audio")).toHaveCount(0);
  const image = page
    .locator("#source-monitor")
    .getByRole("img", { name: "image", exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(save).toHaveAttribute("data-status", "saved");

  // Edit the image position and save the change to the project file.
  const x = page
    .getByTestId("inspector")
    .getByRole("textbox", { name: "x", exact: true });
  await x.fill("400");
  await x.press("Enter");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  const savedProjectJson = JSON.parse(
    await readFile(editor.projectFile, "utf-8"),
  );
  expect(savedProjectJson.layers[2].box.x).toBe(400);

  // Reload the project and confirm the saved position survives.
  await page.reload();
  await layers
    .getByRole("button", { name: "image image", exact: true })
    .click();
  await expect(x).toHaveValue("400");
  await expect(save).toHaveAttribute("data-status", "saved");
  expect(errors).toEqual([]);
});

test("resize and collapse the source monitor without changing the project", async ({
  page,
  editor,
}) => {
  // Open a video source and seek independently of project timing.
  await page.goto(editor.url);
  await page
    .getByTestId("editor-timeline")
    .getByRole("button", { name: "video video", exact: true })
    .click();
  const source = page.locator("#source-monitor video");
  await expect
    .poll(() => source.evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  await source.evaluate((video: HTMLVideoElement) => {
    video.currentTime = 1;
  });
  await expect
    .poll(() => source.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(1);

  // Drag the split and nudge it with the keyboard to resize the source panel.
  const split = page.getByRole("separator", {
    name: "Source and composition split",
  });
  const bounds = (await split.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 100, bounds.y + 20);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await split.getAttribute("aria-valuenow")))
    .toBeGreaterThan(35);
  await split.press("Home");
  await split.press("ArrowRight");
  await expect(split).toHaveAttribute("aria-valuenow", "22");

  // Collapse and reopen Source while preserving the split, position, and save status.
  const toggle = page.getByRole("button", { name: "Hide source", exact: true });
  const before = await toggle.boundingBox();
  await toggle.click();
  await expect(source).toBeHidden();
  const show = page.getByRole("button", { name: "Show source", exact: true });
  expect((await show.boundingBox())!.x).toBe(before!.x);
  await show.click();
  await expect(split).toHaveAttribute("aria-valuenow", "22");
  await expect(source).toBeVisible();
  await expect
    .poll(() => source.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(1);
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});

test("compose the output's first frame and reflect inspector edits", async ({
  page,
  editor,
}) => {
  // Start the output after a trimmed source's timeline offset and add cropped/color overlays.
  const project = JSON.parse(await readFile(editor.projectFile, "utf-8"));
  project.output.start = 1;
  project.layers[0].start = 0.5;
  project.layers[0].in = 0.25;
  project.layers[2].crop = { left: 0.25, right: 0.25 };
  project.layers.push({
    type: "color",
    color: "#ff0000",
    opacity: 0.5,
    box: { x: 10, y: 20, width: 30, height: 40 },
  });
  await writeFile(editor.projectFile, JSON.stringify(project));
  await page.goto(editor.url);
  const canvas = page.getByTestId("composition-canvas");
  const video = canvas.locator("video");
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeCloseTo(0.75);
  await expect(page.getByTestId("composition-time")).toContainText("1.000 s");
  await expect(
    canvas.getByText("Synthetic\nsample", { exact: true }),
  ).toBeVisible();
  const image = canvas.getByRole("img", { name: "image", exact: true });
  await expect(image).toBeVisible();
  expect(
    await image.locator("..").evaluate((element) => ({
      left: (element as HTMLElement).style.left,
      width: (element as HTMLElement).style.width,
    })),
  ).toEqual({ left: "460px", width: "80px" });
  await expect(
    page.getByTestId("composition-layer-4").locator("div"),
  ).toHaveCSS("opacity", "0.5");

  // Select the image and nudge its box while keeping the source file independent.
  await page
    .getByTestId("editor-timeline")
    .getByRole("button", { name: "image image", exact: true })
    .click();
  await expect(canvas.getByLabel("Selected layer outline")).toBeVisible();
  const x = page
    .getByTestId("inspector")
    .getByRole("textbox", { name: "x", exact: true });
  await x.press("ArrowUp");
  await expect(image.locator("..")).toHaveCSS("left", "461px");
  await expect(page.locator("#source-monitor img")).toBeVisible();

  // Move the video beyond the preview time and confirm its visual disappears.
  await page
    .getByTestId("editor-timeline")
    .getByRole("button", { name: "video video", exact: true })
    .click();
  const sourceVideo = page.locator("#source-monitor video");
  await expect
    .poll(() =>
      sourceVideo.evaluate((element: HTMLVideoElement) => element.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await sourceVideo.evaluate((element: HTMLVideoElement) => {
    element.currentTime = 1.25;
  });
  await expect
    .poll(() =>
      sourceVideo.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeCloseTo(1.25);
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeCloseTo(0.75);
  const start = page
    .getByTestId("inspector")
    .getByRole("textbox", { name: "start", exact: true });
  await start.fill("2");
  await start.press("Enter");
  await expect(canvas.locator("video")).toHaveCount(0);
});

test("compose a still project at its output time", async ({ page, editor }) => {
  // Open the still-output sample and seek its video to the requested thumbnail time.
  const thumbnail = await readFile(
    editor.projectFile.replace("project.json", "thumbnail.json"),
    "utf-8",
  );
  await writeFile(editor.projectFile, thumbnail);
  await page.goto(editor.url);
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
