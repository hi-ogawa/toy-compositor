import { expect } from "@playwright/test";
import type { Project } from "../src/lib/project.ts";
import { measureTextHeight } from "../src/lib/render/text.ts";
import { readJson } from "../src/utils/fs.ts";
import {
  commitInspectorField,
  dragBy,
  expectImageLoaded,
  expectInspectorFields,
  clickTimelineButton,
  getInspectorField,
  test,
} from "./helper";

test("place a media layer by position, scale, and size, and save them", async ({
  page,
  editor,
}) => {
  // Select the image and confirm the inspector shows its top-left corner, its
  // scale, and its scaled size.
  await page.goto(editor.url);
  const canvas = page.getByTestId("composition-canvas");
  const image = canvas.getByRole("img", {
    name: "Label backdrop",
    exact: true,
  });
  const placed = image.locator("..");
  const outline = canvas.getByLabel("Selected layer outline");
  await expectImageLoaded(image);
  await clickTimelineButton(page, { name: "Select Label backdrop region" });
  await expectInspectorFields(page, {
    x: "420",
    y: "240",
    "scale %": "100",
    width: "160",
    height: "90",
  });

  // Move the image to the canvas center.
  await commitInspectorField(page, { name: "x", value: "240" });
  await commitInspectorField(page, { name: "y", value: "135" });
  await expect(placed).toHaveCSS("left", "240px");
  await expect(placed).toHaveCSS("top", "135px");

  // Scale it by percentage and confirm it grows around its center.
  await commitInspectorField(page, { name: "scale %", value: "150" });
  await expectInspectorFields(page, { x: "200", width: "240", height: "135" });
  await expect(placed).toHaveCSS("left", "200px");
  await expect(placed).toHaveCSS("top", "113px");
  await expect(placed).toHaveCSS("height", "135px");

  // Set its width directly and confirm the scale and height follow.
  await commitInspectorField(page, { name: "width", value: "320" });
  await expectInspectorFields(page, { "scale %": "200", height: "180" });
  await expect(placed).toHaveCSS("width", "320px");
  await expect(outline).toHaveCSS("left", "160px");
  await expect(outline).toHaveCSS("width", "320px");

  // Crop its left half, then scale it back to 100%, and confirm what remains
  // stays centered.
  await commitInspectorField(page, { name: "left", value: "0.5" });
  await expect(placed).toHaveCSS("left", "320px");
  await expect(placed).toHaveCSS("width", "160px");
  await commitInspectorField(page, { name: "scale %", value: "100" });
  await expect(placed).toHaveCSS("left", "360px");
  await expect(placed).toHaveCSS("width", "80px");

  // Move it partly off the canvas, which clips it rather than limiting it.
  await commitInspectorField(page, { name: "x", value: "-400" });
  await expect(placed).toHaveCSS("left", "-320px");

  // Save and confirm the transform stores the top-left corner and the scale.
  const save = page.getByTestId("editor-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  const project = await readJson<Project>(editor.projectFile);
  expect(project.layers[2].clips[0]).toMatchObject({
    transform: { x: -400, y: 136, scale: 1 },
    crop: { left: 0.5, right: 0, top: 0, bottom: 0 },
  });
});

test("edit a text layer's content and styling and save them", async ({
  page,
  editor,
}) => {
  // Open the project and select the text layer.
  await page.goto(editor.url);
  const canvas = page.getByTestId("composition-canvas");
  await clickTimelineButton(page, { name: "Select Title region" });
  const inspector = page.getByTestId("inspector");

  // Rewrite the text over three lines and confirm the preview follows on blur,
  // cutting the lines off at the box height as the render does.
  const textField = getInspectorField(page, { name: "text" });
  await expect(textField).toHaveValue("Synthetic\nsample");
  await textField.fill("Edited\nthree\nlines");
  await textField.blur();
  const text = canvas.getByText("Edited\nthree\nlines", { exact: true });
  const textBox = text.locator("..");
  await expect(text).toBeVisible();
  await expect(textBox).toHaveCSS("height", "50px");
  await expect(textBox).toHaveCSS("overflow", "hidden");

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

  // Fit the box height to the restyled lines, and confirm the height field and
  // the preview take the height the render measures.
  const height = await measureTextHeight({
    text: "Edited\nthree\nlines",
    align: "right",
    font: { family: "DejaVu Serif", size: 32, weight: 700, lineSpacing: 4 },
    color: "#ffcc00",
  });
  await inspector.getByRole("button", { name: "Fit height to text" }).click();
  await expect(getInspectorField(page, { name: "height" })).toHaveValue(
    String(height),
  );
  await expect(textBox).toHaveCSS("height", `${height}px`);

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
        clips: [
          {
            text: "Edited\nthree\nlines",
            align: "right",
            font: {
              family: "DejaVu Serif",
              size: 32,
              weight: 700,
              lineSpacing: 4,
            },
            color: "#ffcc00",
            box: { x: 420, y: 260, width: 160, height },
          },
        ],
      },
      {},
    ],
  });
  expect(project.layers[3]!.clips[0]).not.toHaveProperty("outline");
});

test("edit layer names and a color layer's fill and box, and save them", async ({
  page,
  editor,
}) => {
  // Add a color layer from the Library tab, and confirm it is numbered after
  // the existing one, selected, and fills the canvas.
  await page.goto(editor.url);
  await page.getByRole("button", { name: "Add Color", exact: true }).click();
  const fill = page
    .getByTestId("composition-layer-5-clip-0")
    .locator("div")
    .first();
  await expect(fill).toHaveCSS("width", "640px");

  // Select the color layer from its lane header, rename it, and confirm its
  // lane and the inspector title follow.
  await clickTimelineButton(page, { name: "Select Color 2 layer" });
  const name = getInspectorField(page, { name: "name" });
  await expect(name).toHaveValue("Color 2");
  await name.fill("Scrim");
  await name.press("Enter");
  await expect(
    page.getByTestId("inspector").getByRole("heading", { name: "Scrim" }),
  ).toBeVisible();

  // Select its clip, and confirm the clip inspector names the layer but
  // leaves the layer's fields to the layer inspector.
  await clickTimelineButton(page, { name: "Select Scrim region" });
  await expect(
    page.getByTestId("inspector").getByRole("heading", { name: "Scrim" }),
  ).toBeVisible();
  await expect(getInspectorField(page, { name: "name" })).toHaveCount(0);

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
    muted: false,
    hidden: false,
    clips: [
      {
        type: "color",
        color: "#ff0000",
        opacity: 0.5,
        start: 0,
        end: 3,
        box: { x: 0, y: 0, width: 320, height: 360 },
      },
    ],
  });
});

test("hide a layer's picture from the layer inspector, and save it", async ({
  page,
  editor,
}) => {
  // Open the sample project, where the test pattern shows in the preview.
  await page.goto(editor.url);
  const video = page.getByTestId("composition-canvas").locator("video");
  await expect(video).toBeVisible();

  // Hide the test pattern layer, and confirm the preview drops its picture.
  await clickTimelineButton(page, { name: "Select Test pattern layer" });
  const hidden = page
    .getByTestId("inspector")
    .getByLabel("hidden", { exact: true });
  await hidden.check();
  await expect(video).toBeHidden();

  // Save and confirm the layer is hidden in the project file.
  const save = page.getByTestId("editor-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  const project = await readJson<Project>(editor.projectFile);
  expect(project.layers[0].hidden).toBe(true);

  // Show it again, and confirm the picture returns.
  await hidden.uncheck();
  await expect(video).toBeVisible();
});

test("resize the inspector by dragging its border", async ({
  page,
  editor,
}) => {
  // Open the synthetic project.
  await page.goto(editor.url);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const initialWidth = (await inspector.boundingBox())!.width;

  // Drag the inspector border left and confirm the inspector widens without
  // changing the project.
  await dragBy(page, page.getByTitle("Resize inspector"), { deltaX: -100 });
  expect((await inspector.boundingBox())!.width).toBeGreaterThan(initialWidth);
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});
