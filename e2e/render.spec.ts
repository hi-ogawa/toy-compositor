import { expect, test } from "@playwright/test";
import { execFileAsync } from "../src/utils/exec.ts";

test("render the synthetic sample", async ({}, testInfo) => {
  // Render the synthetic sample project to an MP4.
  const output = testInfo.outputPath("preview.mp4");
  await execFileAsync(process.execPath, [
    "src/lib/render/cli.ts",
    "samples/synthetic/project.json",
    output,
  ]);
  await testInfo.attach("synthetic render", {
    path: output,
    contentType: "video/mp4",
  });

  // Check that the output has H.264 video and AAC audio matching the project settings.
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

  // Check that the entire rendered video and audio can be decoded without errors.
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

test("render the synthetic thumbnail", async ({}, testInfo) => {
  // Render the synthetic thumbnail project to a PNG still.
  const output = testInfo.outputPath("thumbnail.png");
  await execFileAsync(process.execPath, [
    "src/lib/render/cli.ts",
    "samples/synthetic/thumbnail.json",
    output,
  ]);
  await testInfo.attach("synthetic thumbnail", {
    path: output,
    contentType: "image/png",
  });

  // Check that the output is a single PNG image at the canvas size.
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-of",
    "json",
    output,
  ]);
  const probe = JSON.parse(stdout);
  expect(probe.streams).toEqual([
    expect.objectContaining({
      codec_type: "video",
      codec_name: "png",
      width: 640,
      height: 360,
    }),
  ]);

  // Check that the image can be decoded without errors.
  await execFileAsync("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-i",
    output,
    "-f",
    "null",
    "-",
  ]);
});
