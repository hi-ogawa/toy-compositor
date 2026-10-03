import { expect } from "@playwright/test";
import type { SavedProject } from "../src/lib/migrate.ts";
import type { Project } from "../src/lib/project.ts";
import { measureTextHeight } from "../src/lib/render/text.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { clickTimelineButton, expectInspectorFields, test } from "./helper";

test("read and migrate a color layer without a box", async ({
  page,
  editor,
}) => {
  const readProject = () => readJson<SavedProject>(editor.projectFile);

  // Remove the tint's box, as in a project file from before color layers
  // required one.
  const project = await readProject();
  const migratedProject = {
    ...project,
    layers: project.layers.map((layer) =>
      layer.name === "Tint"
        ? { ...layer, box: { x: 0, y: 0, width: 640, height: 360 } }
        : layer,
    ),
  };
  const removeTintBox = () =>
    editJson<SavedProject>(editor.projectFile, (savedProject) => {
      const tint = savedProject.layers.find((layer) => layer.name === "Tint");
      if (tint?.type === "color") {
        delete tint.box;
      }
    });
  await removeTintBox();
  const savedProject = await readProject();

  // Check it, and confirm it reports the tint and fails without writing.
  await expect(
    execFileAsync(process.execPath, [
      "src/cli.ts",
      "migrate",
      editor.projectFile,
      "--check",
    ]),
  ).rejects.toMatchObject({
    stdout: expect.stringContaining('color layer "Tint" has no box'),
  });
  expect(await readProject()).toEqual(savedProject);

  // Open the editor, and confirm it reports the tint and rewrites the file
  // with the tint covering the whole canvas as it rendered before.
  await page.goto(editor.url);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByText('color layer "Tint" has no box')).toBeVisible();
  expect(await readProject()).toEqual(migratedProject);

  // Remove the box again and render, and confirm it reports the tint and
  // rewrites the file too.
  await removeTintBox();
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.ts",
    "render",
    editor.projectFile,
    `${editor.projectFile}.mp4`,
    "--dry-run",
  ]);
  expect(stdout).toContain('color layer "Tint" has no box');
  expect(await readProject()).toEqual(migratedProject);

  // Check it again, and confirm nothing is left to migrate.
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "migrate",
    editor.projectFile,
    "--check",
  ]);
});

test("read and migrate a text layer without a box height", async ({
  page,
  editor,
}) => {
  const readProject = () => readJson<SavedProject>(editor.projectFile);

  // Remove the title's box height, as in a project file from before text
  // layers stored one, where the box followed the lines.
  const project = await readJson<Project>(editor.projectFile);
  const title = project.layers.find((layer) => layer.name === "Title");
  if (title?.type !== "text") {
    throw new Error("The sample has no title text");
  }
  const height = await measureTextHeight(title);
  const migratedProject = {
    ...project,
    layers: project.layers.map((layer) =>
      layer === title ? { ...title, box: { ...title.box, height } } : layer,
    ),
  };
  const removeTitleHeight = () =>
    editJson<SavedProject>(editor.projectFile, (savedProject) => {
      const layer = savedProject.layers.find((layer) => layer.name === "Title");
      if (layer?.type === "text") {
        delete layer.box.height;
      }
    });
  await removeTitleHeight();
  const savedProject = await readProject();

  // Check it, and confirm it reports the title and fails without writing.
  await expect(
    execFileAsync(process.execPath, [
      "src/cli.ts",
      "migrate",
      editor.projectFile,
      "--check",
    ]),
  ).rejects.toMatchObject({
    stdout: expect.stringContaining('text layer "Title" has no box height'),
  });
  expect(await readProject()).toEqual(savedProject);

  // Open the editor, and confirm it reports the title and rewrites the file
  // with the height the lines rendered at, which the inspector shows.
  await page.goto(editor.url);
  await expect(
    page.getByText('text layer "Title" has no box height'),
  ).toBeVisible();
  expect(await readProject()).toEqual(migratedProject);
  await clickTimelineButton(page, { name: "Title text" });
  await expectInspectorFields(page, { height: String(height) });

  // Remove the height again and render, and confirm it reports the title and
  // rewrites the file too.
  await removeTitleHeight();
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.ts",
    "render",
    editor.projectFile,
    `${editor.projectFile}.mp4`,
    "--dry-run",
  ]);
  expect(stdout).toContain('text layer "Title" has no box height');
  expect(await readProject()).toEqual(migratedProject);
});
