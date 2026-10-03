import { expect, test } from "@playwright/test";
import type { ColorLayer, Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { readJson, writeJson } from "../src/utils/fs.ts";

test("migrate a color layer without a box", async ({}, testInfo) => {
  // Copy the synthetic project without the tint's box, as in a project file
  // from before color layers required one.
  const project = await readJson<Project>("samples/synthetic/project.json");
  const oldProject = structuredClone(project);
  const oldTint = oldProject.layers.find((layer) => layer.name === "Tint");
  delete (oldTint as Partial<ColorLayer>).box;
  const projectFile = testInfo.outputPath("project.json");
  await writeJson(projectFile, oldProject);

  // Check it, and confirm the check fails without writing.
  await expect(
    execFileAsync(process.execPath, [
      "src/cli.ts",
      "migrate",
      projectFile,
      "--check",
    ]),
  ).rejects.toThrow();
  expect(await readJson<Project>(projectFile)).toEqual(oldProject);

  // Migrate it, and confirm the tint covers the whole canvas as it rendered before.
  await execFileAsync(process.execPath, ["src/cli.ts", "migrate", projectFile]);
  expect(await readJson<Project>(projectFile)).toEqual({
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
    projectFile,
    "--check",
  ]);
});
