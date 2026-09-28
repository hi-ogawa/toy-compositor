import { readFile, writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { dragBy, expectImageLoaded, seekVideo, test } from "./helper";

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
  const layers = page.getByTestId("editor-layer-list");

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
  await expectImageLoaded(image);
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
  await page
    .getByTestId("editor-layer-list")
    .getByRole("button", { name: "image image", exact: true })
    .click();
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
  await page
    .getByTestId("editor-layer-list")
    .getByRole("button", { name: "video video", exact: true })
    .click();
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

test("reflect an inspector edit in the composition preview", async ({
  page,
  editor,
}) => {
  // Open the synthetic project and confirm the preview composes its image.
  await page.goto(editor.url);
  const image = page
    .getByTestId("composition-canvas")
    .getByRole("img", { name: "image", exact: true });
  await expectImageLoaded(image);
  await expect(image.locator("..")).toHaveCSS("left", "420px");

  // Nudge the image position in the inspector and confirm the preview follows.
  await page
    .getByTestId("editor-layer-list")
    .getByRole("button", { name: "image image", exact: true })
    .click();
  await page
    .getByTestId("inspector")
    .getByRole("textbox", { name: "x", exact: true })
    .press("ArrowUp");
  await expect(image.locator("..")).toHaveCSS("left", "421px");
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
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});
