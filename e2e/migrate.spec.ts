import { expect } from "@playwright/test";
import type { SavedProject } from "../src/lib/migrate.ts";
import type { Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { test } from "./helper";

test("read and migrate an older project file", async ({ page, editor }) => {
  const readProject = () => readJson<SavedProject>(editor.projectFile);

  // Flatten every layer into its one clip, and remove the image's name, the
  // tint's box, and the title's box height, as in a project file from before
  // layers held clips, layers required a name, color layers required a box,
  // and text layers stored a height. The image then gets the editor's numbered
  // name, the tint covered the canvas, and the title's box followed its lines,
  // which is the height the sample stores.
  const project = await readJson<Project>(editor.projectFile);
  const migratedProject = {
    ...project,
    layers: project.layers.map((layer) => {
      const clip = layer.clips[0]!;
      switch (clip.type) {
        case "image": {
          return { ...layer, name: "Image 1" };
        }
        case "color": {
          return {
            ...layer,
            clips: [{ ...clip, box: { x: 0, y: 0, width: 640, height: 360 } }],
          };
        }
        default: {
          return layer;
        }
      }
    }),
  };
  const removeFields = () =>
    editJson<SavedProject>(editor.projectFile, (savedProject) => {
      savedProject.layers = project.layers.map(({ clips, ...layer }) => {
        const clip = clips[0]!;
        switch (clip.type) {
          case "image": {
            const { name: _name, ...rest } = layer;
            return { ...rest, ...clip };
          }
          case "color": {
            const { box: _box, ...rest } = clip;
            return { ...layer, ...rest };
          }
          case "text": {
            const { height: _height, ...box } = clip.box;
            return { ...layer, ...clip, box };
          }
          default: {
            return { ...layer, ...clip };
          }
        }
      });
    });
  const changes = [
    'layer "Test pattern" has no clips',
    'layer "Tone 660 Hz" has no clips',
    'image layer "Image 1" has no name',
    'layer "Image 1" has no clips',
    'layer "Title" has no clips',
    'text clip in layer "Title" has no box height',
    'layer "Tint" has no clips',
    'color clip in layer "Tint" has no box',
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

test("reject a layer whose clips overlap", async ({ page, editor }) => {
  // Split the test pattern into clips that butt at 1 s, but hold the first
  // clip's last frame for 0.5 s, so its picture overlaps the second clip.
  await editJson<Project>(editor.projectFile, (project) => {
    const layer = project.layers[0]!;
    const clip = layer.clips[0]!;
    if (clip.type === "video") {
      layer.clips = [
        { ...clip, out: 1, hold: { after: 0.5 } },
        { ...clip, start: 1, in: 1 },
      ];
    }
  });
  const message = 'layer "Test pattern" has clips overlapping at 1 s';

  // Open the editor, and confirm it shows the error instead of the editor.
  await page.goto(editor.url);
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(0);

  // Check it, and confirm it fails with the same error.
  await expect(
    execFileAsync(process.execPath, [
      "src/cli.ts",
      "migrate",
      editor.projectFile,
      "--check",
    ]),
  ).rejects.toMatchObject({ stderr: expect.stringContaining(message) });
});
