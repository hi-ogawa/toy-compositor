import { expect } from "@playwright/test";
import type { SavedProject } from "../src/lib/migrate.ts";
import type { Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { test } from "./helper";

test("read and migrate an older project file", async ({ page, editor }) => {
  const readProject = () => readJson<SavedProject>(editor.projectFile);

  // Remove the image's name, the tint's box, and the title's box height, as in
  // a project file from before layers required a name, color layers required a
  // box, and text layers stored a height. The image then gets the editor's
  // numbered name, the tint covered the canvas, and the title's box followed
  // its lines, which is the height the sample stores.
  const project = await readJson<Project>(editor.projectFile);
  const migratedProject = {
    ...project,
    layers: project.layers.map((layer) => {
      switch (layer.type) {
        case "image": {
          return { ...layer, name: "Image 1" };
        }
        case "color": {
          return { ...layer, box: { x: 0, y: 0, width: 640, height: 360 } };
        }
        default: {
          return layer;
        }
      }
    }),
  };
  const removeFields = () =>
    editJson<SavedProject>(editor.projectFile, (savedProject) => {
      for (const layer of savedProject.layers) {
        if (layer.type === "image") {
          delete layer.name;
        }
        if (layer.type === "color") {
          delete layer.box;
        }
        if (layer.type === "text") {
          delete layer.box.height;
        }
      }
    });
  const changes = [
    'image layer "Image 1" has no name',
    'color layer "Tint" has no box',
    'text layer "Title" has no box height',
  ];
  await removeFields();
  const savedProject = await readProject();

  // Check it, and confirm it reports each layer and fails without writing.
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

  // Open the editor, and confirm it reports each layer and rewrites the file
  // to render as before.
  await page.goto(editor.url);
  await expect(page.getByRole("main")).toBeVisible();
  for (const change of changes) {
    await expect(page.getByText(change)).toBeVisible();
  }
  expect(await readProject()).toEqual(migratedProject);

  // Remove the fields again and render, and confirm it reports each layer and
  // rewrites the file too.
  await removeFields();
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
