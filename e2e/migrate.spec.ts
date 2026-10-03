import { expect } from "@playwright/test";
import type { SavedProject } from "../src/lib/migrate.ts";
import type { Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { test } from "./helper";

type SavedFlatLayer = Exclude<
  SavedProject["layers"][number],
  { clips: unknown }
>;

test("read and migrate an older project file", async ({ page, editor }) => {
  const readProject = () => readJson<SavedProject>(editor.projectFile);

  // Flatten every layer into its one clip, and remove the image's name, the
  // tint's box, the title's box height, and neutral values, as in a project
  // file from before layers held clips, layers required a name, color layers
  // required a box, text layers stored a height, and neutral values were
  // written out. The image then gets the editor's numbered name, the tint
  // covered the canvas, the title's box followed its lines, which is the height
  // the sample stores, and the neutral values are the sample's.
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
      delete savedProject.canvas.background;
      const layers: SavedFlatLayer[] = project.layers.map(
        ({ clips, ...layer }) => ({ ...layer, ...structuredClone(clips[0]!) }),
      );
      for (const layer of layers) {
        if (!layer.muted) {
          delete layer.muted;
        }
        if (layer.type === "video") {
          delete layer.crop;
          delete layer.fadeIn;
          delete layer.fadeOut;
          delete layer.hold;
        }
        if (layer.type === "image") {
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
