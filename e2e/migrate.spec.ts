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
