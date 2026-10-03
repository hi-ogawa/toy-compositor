import { cp } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import type { SavedProject } from "../src/lib/migrate.ts";
import type { Project } from "../src/lib/project.ts";
import { getProjectPageUrl } from "../src/lib/routes.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { test } from "./helper";

test("read and migrate a color layer without a box", async ({
  page,
  editor,
}) => {
  // Copy the project without the tint's box, as in a project file from before
  // color layers required one.
  const oldFile = path.join(editor.projectDir, "old.json");
  await cp(editor.projectFile, oldFile);
  await editJson<SavedProject>(oldFile, (project) => {
    const tint = project.layers.find((layer) => layer.name === "Tint");
    if (tint?.type === "color") {
      delete tint.box;
    }
  });
  const oldProject = await readJson<SavedProject>(oldFile);

  // Open the copy in the editor, and confirm it loads as it is.
  await page.goto(getProjectPageUrl({ path: oldFile }));
  await expect(page.getByRole("main")).toBeVisible();

  // Render the copy, and confirm it accepts the project too.
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "render",
    oldFile,
    `${oldFile}.mp4`,
    "--dry-run",
  ]);

  // Check the copy, and confirm the check fails without writing.
  await expect(
    execFileAsync(process.execPath, [
      "src/cli.ts",
      "migrate",
      oldFile,
      "--check",
    ]),
  ).rejects.toThrow();
  expect(await readJson<SavedProject>(oldFile)).toEqual(oldProject);

  // Migrate the copy, and confirm it matches the original except that the tint
  // covers the whole canvas, as it rendered before.
  await execFileAsync(process.execPath, ["src/cli.ts", "migrate", oldFile]);
  const project = await readJson<Project>(editor.projectFile);
  expect(await readJson<Project>(oldFile)).toEqual({
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
    oldFile,
    "--check",
  ]);
});
