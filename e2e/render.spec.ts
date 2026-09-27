import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execFileAsync = promisify(execFile);

test("set up and render the synthetic sample", async ({}, testInfo) => {
  const root = process.cwd();
  const cwd = testInfo.outputPath("workspace");
  await mkdir(cwd, { recursive: true });

  // Set up a fresh copy without touching locally edited sample projects.
  await execFileAsync(
    process.execPath,
    [
      path.join(root, "tools/samples/setup.ts"),
      path.join(root, "samples/synthetic"),
    ],
    { cwd },
  );
  const output = path.join(cwd, ".local/projects/synthetic/out/preview.mp4");
  await execFileAsync(
    process.execPath,
    [
      path.join(root, "src/lib/cli.ts"),
      ".local/projects/synthetic/project.json",
      output,
    ],
    { cwd },
  );
  await testInfo.attach("synthetic render", {
    path: output,
    contentType: "video/mp4",
  });

  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    output,
  ]);
  const probe = JSON.parse(stdout);
  expect(probe.streams).toHaveLength(2);
  expect(probe.streams).toContainEqual(
    expect.objectContaining({
      codec_type: "video",
      codec_name: "h264",
      width: 640,
      height: 360,
      avg_frame_rate: "30/1",
      nb_frames: "90",
    }),
  );
  expect(probe.streams).toContainEqual(
    expect.objectContaining({
      codec_type: "audio",
      codec_name: "aac",
    }),
  );
  expect(Number(probe.format.duration)).toBeCloseTo(3, 1);

  // Decode all video and audio, failing on corrupt packets or frames.
  await execFileAsync("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-i",
    output,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-f",
    "null",
    "-",
  ]);
});
