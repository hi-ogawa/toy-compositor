import { expect } from "@playwright/test";
import type { SavedProject } from "../src/lib/migrate.ts";
import type { Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { test } from "./helper";

test("read and migrate a color layer without a box", async ({
  page,
  editor,
}) => {
  // Remove the tint's box, as in a project file from before color layers
  // required one.
  const project = await readJson<Project>(editor.projectFile);
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
  const savedProject = await readJson<SavedProject>(editor.projectFile);

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
  expect(await readJson<SavedProject>(editor.projectFile)).toEqual(
    savedProject,
  );

  // Open the editor, and confirm it reports the tint and rewrites the file
  // with the tint covering the whole canvas as it rendered before.
  await page.goto(editor.url);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByText('color layer "Tint" has no box')).toBeVisible();
  expect(await readJson<Project>(editor.projectFile)).toEqual(migratedProject);

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
  expect(await readJson<Project>(editor.projectFile)).toEqual(migratedProject);

  // Check it again, and confirm nothing is left to migrate.
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "migrate",
    editor.projectFile,
    "--check",
  ]);
});
