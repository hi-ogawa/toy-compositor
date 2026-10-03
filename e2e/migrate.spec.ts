import { expect } from "@playwright/test";
import type { SavedProject } from "../src/lib/migrate.ts";
import type { Project } from "../src/lib/project.ts";
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

test("name unnamed layers when opening a project", async ({ page, editor }) => {
  // Remove the title's and the tint's names, as in a project file from before
  // layers required a name.
  await editJson<SavedProject>(editor.projectFile, (savedProject) => {
    for (const layer of savedProject.layers) {
      if (layer.name === "Title" || layer.name === "Tint") {
        delete layer.name;
      }
    }
  });

  // Open the editor, and confirm it numbers each layer by its type, reports
  // both, and shows the names on their lanes.
  await page.goto(editor.url);
  await expect(page.getByText('text layer "Text 1" has no name')).toBeVisible();
  await expect(
    page.getByText('color layer "Color 1" has no name'),
  ).toBeVisible();
  const lanes = page.getByTestId("editor-timeline");
  await expect(
    lanes.getByRole("button", { name: "Text 1 text", exact: true }),
  ).toBeVisible();
  await expect(
    lanes.getByRole("button", { name: "Color 1 color", exact: true }),
  ).toBeVisible();

  // Confirm the file is rewritten with the names.
  const project = await readJson<Project>(editor.projectFile);
  expect(project.layers.map((layer) => layer.name)).toEqual([
    "Test pattern",
    "Tone 660 Hz",
    "Label backdrop",
    "Text 1",
    "Color 1",
  ]);
});
