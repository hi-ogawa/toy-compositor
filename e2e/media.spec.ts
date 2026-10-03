import { expect } from "@playwright/test";
import type { Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { test } from "./helper";

test("update a project's media info", async ({ editor }) => {
  // Remove the media from a copy of the synthetic project.
  const { media: mediaInfoMap } = await readJson<Project>(editor.projectFile);
  await editJson<Partial<Project>>(editor.projectFile, (project) => {
    delete project.media;
  });

  // Run the update-media command, and confirm it writes back the committed media.
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "update-media",
    editor.projectFile,
  ]);
  expect((await readJson<Project>(editor.projectFile)).media).toEqual(
    mediaInfoMap,
  );
});

test("reject a clip whose file has no media info", async ({ page, editor }) => {
  // Remove the image's entry, as if the clip was added without update-media.
  await editJson<Project>(editor.projectFile, (project) => {
    delete project.media["media/image.png"];
  });
  const message =
    'image clip in layer "Label backdrop" (media/image.png) has no media info, run update-media';

  // Open the editor, and confirm it shows the error instead of the editor.
  await page.goto(editor.url);
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(0);

  // Render, and confirm it fails with the same error.
  await expect(
    execFileAsync(process.execPath, [
      "src/cli.ts",
      "render",
      editor.projectFile,
      `${editor.projectFile}.mp4`,
      "--dry-run",
    ]),
  ).rejects.toMatchObject({ stderr: expect.stringContaining(message) });
});
