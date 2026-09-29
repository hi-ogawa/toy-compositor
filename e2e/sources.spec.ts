import { expect } from "@playwright/test";
import type { Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson, readJson } from "../src/utils/fs.ts";
import { test } from "./helper";

test("probe a project's media into its sources", async ({ editor }) => {
  // Remove the sources from a copy of the synthetic project.
  const { sources } = await readJson<Project>(editor.projectFile);
  await editJson<Partial<Project>>(editor.projectFile, (project) => {
    delete project.sources;
  });

  // Run the probe command, and confirm it writes back the committed sources.
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "probe",
    editor.projectFile,
  ]);
  expect((await readJson<Project>(editor.projectFile)).sources).toEqual(
    sources,
  );
});

test("probe one source through the editor API", async ({ request, editor }) => {
  // Request the video's facts, and confirm they match its sources entry.
  const { sources } = await readJson<Project>(editor.projectFile);
  const res = await request.get("/api/media-info", {
    params: {
      project: `${editor.projectDir}/project.json`,
      src: "media/video.mp4",
    },
  });
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual(sources["media/video.mp4"]);
});
