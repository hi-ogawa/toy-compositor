import { expect, type Page } from "@playwright/test";
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
  await expectMediaError({
    page,
    editor,
    message:
      'image layer "Label backdrop" (media/image.png) has no media info, run update-media',
  });
});

test("reject a video layer whose file has no video stream", async ({
  page,
  editor,
}) => {
  // Point the video layer at the audio file, whose entry has no video.
  await editJson<Project>(editor.projectFile, (project) => {
    Object.assign(project.layers[0], { src: "media/audio.wav" });
  });
  await expectMediaError({
    page,
    editor,
    message:
      'video layer "Test pattern" (media/audio.wav) has no video stream, use a file with video or run update-media if the file changed',
  });
});

/** Confirm the editor shows the error instead of the editor, and render fails with it. */
async function expectMediaError({
  page,
  editor,
  message,
}: {
  page: Page;
  editor: { url: string; projectFile: string };
  message: string;
}) {
  await page.goto(editor.url);
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(0);

  await expect(
    execFileAsync(process.execPath, [
      "src/cli.ts",
      "render",
      editor.projectFile,
      `${editor.projectFile}.mp4`,
      "--dry-run",
    ]),
  ).rejects.toMatchObject({ stderr: expect.stringContaining(message) });
}

test("probe one file's media info through the editor API", async ({
  request,
  editor,
}) => {
  // Request the video's media info, and confirm it matches its media entry.
  const { media: mediaInfoMap } = await readJson<Project>(editor.projectFile);
  const res = await request.get("/api/media-info", {
    params: {
      project: `${editor.projectDir}/project.json`,
      src: "media/video.mp4",
    },
  });
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual(mediaInfoMap["media/video.mp4"]);
});
