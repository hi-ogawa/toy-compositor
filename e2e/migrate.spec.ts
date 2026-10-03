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
  // Remove the tint's box, as in a project file from before color layers
  // required one.
  const project = await readJson<Project>(editor.projectFile);
  await editJson<SavedProject>(editor.projectFile, (savedProject) => {
    const tint = savedProject.layers.find((layer) => layer.name === "Tint");
    if (tint?.type === "color") {
      delete tint.box;
    }
  });
  const savedProject = await readJson<SavedProject>(editor.projectFile);

  // Open the editor, and confirm it loads the project as it is.
  await page.goto(editor.url);
  await expect(page.getByRole("main")).toBeVisible();

  // Render, and confirm it accepts the project too.
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "render",
    editor.projectFile,
    `${editor.projectFile}.mp4`,
    "--dry-run",
  ]);

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

  // Migrate it, and confirm the tint covers the whole canvas as it rendered before.
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "migrate",
    editor.projectFile,
  ]);
  expect(await readJson<Project>(editor.projectFile)).toEqual({
    ...project,
    layers: project.layers.map((layer) =>
      layer.name === "Tint"
        ? { ...layer, box: { x: 0, y: 0, width: 640, height: 360 } }
        : layer,
    ),
  });

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
  // Remove the title's box height, as in a project file from before text
  // layers stored one, where the box followed the lines.
  const project = await readJson<Project>(editor.projectFile);
  await editJson<SavedProject>(editor.projectFile, (savedProject) => {
    const title = savedProject.layers.find((layer) => layer.name === "Title");
    if (title?.type === "text") {
      delete title.box.height;
    }
  });
  const title = project.layers.find((layer) => layer.name === "Title");
  if (title?.type !== "text") {
    throw new Error("The sample has no title text");
  }
  const height = await measureTextHeight(title);

  // Open the editor, select the title, and confirm its box takes the height
  // its lines rendered at.
  await page.goto(editor.url);
  await clickTimelineButton(page, { name: "Title text" });
  await expectInspectorFields(page, { height: String(height) });

  // Check it, and confirm it reports the title.
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

  // Migrate it, and confirm the title's box stores the measured height.
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "migrate",
    editor.projectFile,
  ]);
  expect(await readJson<Project>(editor.projectFile)).toEqual({
    ...project,
    layers: project.layers.map((layer) =>
      layer === title ? { ...title, box: { ...title.box, height } } : layer,
    ),
  });
});
