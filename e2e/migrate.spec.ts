import { expect } from "@playwright/test";
import type { SavedProject } from "../src/lib/migrate.ts";
import type { Box, Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { test } from "./helper";

test("read and migrate an older project file", async ({ page, editor }) => {
  const readProject = () => readJson<SavedProject>(editor.projectFile);

  // Remove the tint's box and the title's box height, as in a project file
  // from before color layers required a box and text layers stored a height.
  // The tint then covered the canvas, and the title's box followed its lines,
  // which is the height the sample stores.
  const project = await readJson<Project>(editor.projectFile);
  const migratedProject = {
    ...project,
    layers: project.layers.map((layer) =>
      layer.name === "Tint"
        ? { ...layer, box: { x: 0, y: 0, width: 640, height: 360 } }
        : layer,
    ),
  };
  const removeBoxes = () =>
    editJson<SavedProject>(editor.projectFile, (savedProject) => {
      for (const layer of savedProject.layers) {
        if (layer.type === "color" && layer.name === "Tint") {
          delete layer.box;
        }
        if (layer.type === "text" && layer.name === "Title") {
          delete layer.box.height;
        }
      }
    });
  const changes = [
    'color layer "Tint" has no box',
    'text layer "Title" has no box height',
  ];
  await removeBoxes();
  const savedProject = await readProject();

  // Check it, and confirm it reports both layers and fails without writing.
  const check = execFileAsync(process.execPath, [
    "src/cli.ts",
    "migrate",
    editor.projectFile,
    "--check",
  ]);
  for (const change of changes) {
    await expect(check).rejects.toMatchObject({
      stdout: expect.stringContaining(change),
    });
  }
  expect(await readProject()).toEqual(savedProject);

  // Open the editor, and confirm it reports both layers and rewrites the file
  // to render as before.
  await page.goto(editor.url);
  await expect(page.getByRole("main")).toBeVisible();
  for (const change of changes) {
    await expect(page.getByText(change)).toBeVisible();
  }
  expect(await readProject()).toEqual(migratedProject);

  // Remove the boxes again and render, and confirm it reports both layers and
  // rewrites the file too.
  await removeBoxes();
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.ts",
    "render",
    editor.projectFile,
    `${editor.projectFile}.mp4`,
    "--dry-run",
  ]);
  for (const change of changes) {
    expect(stdout).toContain(change);
  }
  expect(await readProject()).toEqual(migratedProject);

  // Check it again, and confirm nothing is left to migrate.
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "migrate",
    editor.projectFile,
    "--check",
  ]);
});

test("read and migrate media layers with fit boxes", async ({
  page,
  editor,
}) => {
  const readProject = () => readJson<SavedProject>(editor.projectFile);

  // Replace the video's and the image's transforms with the fit boxes from
  // before transforms. The image also crops its left quarter, and its box is
  // wider than what remains, so the fit centers it with space on both sides.
  const project = await readProject();
  const boxes: Record<string, Box> = {
    "Test pattern": { x: 0, y: 0, width: 640, height: 360 },
    "Label backdrop": { x: 400, y: 240, width: 200, height: 90 },
  };
  await editJson<SavedProject>(editor.projectFile, (savedProject) => {
    for (const layer of savedProject.layers) {
      if (layer.name && boxes[layer.name] && "transform" in layer) {
        delete layer.transform;
        Object.assign(layer, { box: boxes[layer.name] });
      }
      if (layer.name === "Label backdrop" && layer.type === "image") {
        layer.crop = { left: 0.25 };
      }
    }
  });
  const savedProject = await readProject();

  // Check it, and confirm it reports both layers and fails without writing.
  await expect(
    execFileAsync(process.execPath, [
      "src/cli.ts",
      "migrate",
      editor.projectFile,
      "--check",
    ]),
  ).rejects.toMatchObject({
    stdout: expect.stringMatching(
      /video layer "Test pattern" has a fit box[\s\S]*image layer "Label backdrop" has a fit box/,
    ),
  });
  expect(await readProject()).toEqual(savedProject);

  // Open the editor, and confirm the image sits where the fit put it and the
  // file gets transforms that place both layers the same way. The image's
  // corner is the hidden quarter's left edge, 40 px before the visible part.
  await page.goto(editor.url);
  const image = page
    .getByTestId("composition-canvas")
    .getByRole("img", { name: "Label backdrop", exact: true });
  await expect(image.locator("..")).toHaveCSS("left", "440px");
  await expect(image.locator("..")).toHaveCSS("width", "120px");
  expect(await readProject()).toEqual({
    ...project,
    layers: project.layers.map((layer) =>
      layer.name === "Label backdrop"
        ? {
            ...layer,
            transform: { x: 400, y: 240, scale: 1 },
            crop: { left: 0.25 },
          }
        : layer,
    ),
  });
});
