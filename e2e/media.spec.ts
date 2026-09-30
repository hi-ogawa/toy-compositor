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

test("reject a layer whose file has no media info", async ({
  page,
  editor,
}) => {
  // Remove the image's entry, as if the layer was added without update-media.
  await editJson<Project>(editor.projectFile, (project) => {
    delete project.media["media/image.png"];
  });
  const message =
    'image layer "Label backdrop" (media/image.png) has no media info, run update-media';

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

test("probe one file's media info through the editor API", async ({
  request,
  editor,
}) => {
  // Request the video's media info, and confirm it matches its media entry.
  const { media: mediaInfoMap } = await readJson<Project>(editor.projectFile);
  const res = await request.post("/api/rpc/loadMediaInfo", {
    data: {
      projectPath: `${editor.projectDir}/project.json`,
      src: "media/video.mp4",
    },
  });
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual(mediaInfoMap["media/video.mp4"]);
});

test("reject a form POST to the editor API", async ({ request, editor }) => {
  // Post a form, as a page on another site could, and confirm it is refused
  // before the method runs.
  const res = await request.post("/api/rpc/openMediaFolder", {
    form: { projectPath: `${editor.projectDir}/project.json` },
  });
  expect(res.status()).toBe(415);
});
