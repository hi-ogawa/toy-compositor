import { expect } from "@playwright/test";
import type { SavedProject } from "../src/lib/migrate.ts";
import type { Box, Project } from "../src/lib/project.ts";
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

test("read and migrate media layers with fit boxes", async ({
  page,
  editor,
}) => {
  // Replace the video's and the image's transforms with the fit boxes from
  // before transforms. The image box is wider than the image, so the fit
  // letterboxes it.
  const project = await readJson<Project>(editor.projectFile);
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
    }
  });

  // Open the editor, and confirm the image sits where the fit put it.
  await page.goto(editor.url);
  const image = page
    .getByTestId("composition-canvas")
    .getByRole("img", { name: "Label backdrop", exact: true });
  await expect(image.locator("..")).toHaveCSS("left", "420px");
  await expect(image.locator("..")).toHaveCSS("width", "160px");

  // Check it, and confirm it reports both layers.
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

  // Migrate it, and confirm both get back the transforms that place them the
  // same way.
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "migrate",
    editor.projectFile,
  ]);
  expect(await readJson<Project>(editor.projectFile)).toEqual(project);
});
