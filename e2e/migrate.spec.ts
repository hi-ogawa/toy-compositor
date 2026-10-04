import { expect } from "@playwright/test";
import type { SavedFlatLayer, SavedProject } from "../src/lib/migrate.ts";
import type { Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { test } from "./helper";

test("read and migrate an older project file", async ({ page, editor }) => {
  const readProject = () => readJson<SavedProject>(editor.projectFile);

  // Flatten every layer into its one clip, replace the video's and the image's
  // transforms with fit boxes, and remove the image's name, the tint's box, the
  // title's box height, and neutral values, as in a project file from before
  // layers held clips, media had transforms, layers required a name, color
  // layers required a box, text layers stored a height, and neutral values
  // were written out. The image then gets the editor's numbered name, the tint
  // covered the canvas, the title's box followed its lines, which is the height
  // the sample stores, and the neutral values are the sample's. The image also
  // crops its left quarter, and its box is wider than what remains, so the fit
  // centers it with space on both sides, and its corner is the hidden
  // quarter's left edge, 40 px before the visible part.
  const project = await readJson<Project>(editor.projectFile);
  const migratedProject = {
    ...project,
    layers: project.layers.map((layer) => {
      const clip = layer.clips[0]!;
      switch (clip.type) {
        case "image": {
          return {
            ...layer,
            name: "Image 1",
            clips: [
              {
                ...clip,
                transform: { x: 400, y: 240, scale: 1 },
                crop: { left: 0.25, right: 0, top: 0, bottom: 0 },
              },
            ],
          };
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
      delete savedProject.canvas.background;
      const layers: SavedFlatLayer[] = project.layers.map(
        ({ clips, hidden: _hidden, ...layer }) => ({
          ...layer,
          ...structuredClone(clips[0]!),
        }),
      );
      for (const layer of layers) {
        if (!layer.muted) {
          delete layer.muted;
        }
        if (layer.type === "video") {
          delete layer.transform;
          layer.box = { x: 0, y: 0, width: 640, height: 360 };
          delete layer.crop;
          delete layer.fadeIn;
          delete layer.fadeOut;
          delete layer.hold;
        }
        if (layer.type === "image") {
          delete layer.transform;
          layer.box = { x: 400, y: 240, width: 200, height: 90 };
          layer.crop = { left: 0.25 };
          delete layer.name;
        }
        if (layer.type === "color") {
          delete layer.box;
        }
        if (layer.type === "text") {
          delete layer.box.height;
          delete layer.font.weight;
        }
      }
      savedProject.layers = layers;
    });
  const changes = [
    'layer "Test pattern" has no clips',
    'video clip in layer "Test pattern" has a fit box instead of a transform',
    'layer "Tone 660 Hz" has no clips',
    'image layer "Image 1" has no name',
    'layer "Image 1" has no clips',
    'image clip in layer "Image 1" has a fit box instead of a transform',
    'layer "Title" has no clips',
    'text clip in layer "Title" has no box height',
    'layer "Tint" has no clips',
    'color clip in layer "Tint" has no box',
  ];
  await removeFields();
  const savedProject = await readProject();

  // Check it, and confirm it reports each change and fails without writing.
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

  // Open the editor, and confirm it reports each change and rewrites the file
  // to render as before.
  await page.goto(editor.url);
  await expect(page.getByRole("main")).toBeVisible();
  for (const change of changes) {
    await expect(page.getByText(change)).toBeVisible();
  }
  expect(await readProject()).toEqual(migratedProject);

  // Remove the fields again and render, and confirm it reports each change and
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
