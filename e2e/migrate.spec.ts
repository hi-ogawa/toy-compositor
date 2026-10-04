import { expect } from "@playwright/test";
import type { SavedFlatLayer, SavedProject } from "../src/lib/migrate.ts";
import type { Project } from "../src/lib/project.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { runCli } from "./cli";
import { test } from "./helper";

test("read and migrate an older project file", async ({ page, editor }) => {
  const readProject = () => readJson<SavedProject>(editor.projectFile);

  // Rewrite the project the way older builds saved it, with each field that
  // later formats added or required removed or in its old shape, so migrating
  // it must reproduce the current project. The image is cropped, so converting
  // its fit box has to account for the hidden part.
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
  const check = runCli(["migrate", editor.projectFile, "--check"]);
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
  const { stdout } = await runCli([
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
  await runCli(["migrate", editor.projectFile, "--check"]);
});
