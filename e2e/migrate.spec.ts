import { expect } from "@playwright/test";
import type { ColorLayer, Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { readJson, writeJson } from "../src/utils/fs.ts";
import { test } from "./helper";

test("read and migrate a color layer without a box", async ({
  page,
  editor,
}) => {
  // Remove the tint's box, as in a project file from before color layers
  // required one.
  const project = await readJson<Project>(editor.projectFile);
  const oldProject = structuredClone(project);
  const oldTint = oldProject.layers.find((layer) => layer.name === "Tint");
  delete (oldTint as Partial<ColorLayer>).box;
  await writeJson(editor.projectFile, oldProject);

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

  // Check it, and confirm the check fails without writing.
  await expect(
    execFileAsync(process.execPath, [
      "src/cli.ts",
      "migrate",
      editor.projectFile,
      "--check",
    ]),
  ).rejects.toThrow();
  expect(await readJson<Project>(editor.projectFile)).toEqual(oldProject);

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
