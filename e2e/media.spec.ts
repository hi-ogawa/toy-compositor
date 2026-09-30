import { expect } from "@playwright/test";
import type { Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { test } from "./helper";

test("update a project's media info", async ({ editor }) => {
  // Remove the media from a copy of the synthetic project.
  const { media } = await readJson<Project>(editor.projectFile);
  await editJson<Partial<Project>>(editor.projectFile, (project) => {
    delete project.media;
  });

  // Run the update-media command, and confirm it writes back the committed media.
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "update-media",
    editor.projectFile,
  ]);
  expect((await readJson<Project>(editor.projectFile)).media).toEqual(media);
});

test("probe one file's media info through the editor API", async ({
  request,
  editor,
}) => {
  // Request the video's media info, and confirm it matches its media entry.
  const { media } = await readJson<Project>(editor.projectFile);
  const res = await request.get("/api/media-info", {
    params: {
      project: `${editor.projectDir}/project.json`,
      src: "media/video.mp4",
    },
  });
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual(media["media/video.mp4"]);
});
