import { cp } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson } from "../src/utils/fs.ts";

test("render the synthetic sample", async ({}, testInfo) => {
  // Render the synthetic sample project to an MP4.
  const output = testInfo.outputPath("preview.mp4");
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "render",
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
    "src/cli.ts",
    "render",
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

test("fade audio at the layer's own edges when the output cuts into them", async ({}, testInfo) => {
  // Copy the synthetic sample and keep only its tone, which fades in over 0.2s
  // and out over 0.5s across 0 to 3s, then cut the output into both fades.
  const directory = testInfo.outputPath("project");
  await cp("samples/synthetic", directory, { recursive: true });
  await editJson<Project>(`${directory}/project.json`, (project) => {
    project.layers = project.layers.filter((layer) => layer.type === "audio");
    project.output = { type: "video", start: 0.1, end: 2.8 };
  });
  const output = testInfo.outputPath("cut.mp4");
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "render",
    `${directory}/project.json`,
    output,
  ]);

  // Check that the cut edges keep the partial level of the layer's fades,
  // about half of full level, instead of fading from and to silence.
  const full = await measureRmsLevel(output, { time: 1.3 });
  expect(full - (await measureRmsLevel(output, { time: 0 }))).toBeLessThan(9);
  expect(full - (await measureRmsLevel(output, { time: 2.68 }))).toBeLessThan(
    9,
  );
});

test("cover the output frames nearest a layer's start and end", async ({}, testInfo) => {
  // Copy the synthetic sample and keep only its test pattern, starting at
  // 1.033s, which is frame 31 at 30fps rounded to milliseconds, and playing
  // 0.936s, so it ends at 1.969s, nearest frame 59.
  const directory = testInfo.outputPath("project");
  await cp("samples/synthetic", directory, { recursive: true });
  await editJson<Project>(`${directory}/project.json`, (project) => {
    project.layers = project.layers
      .filter((layer) => layer.type === "video")
      .map((layer) => ({ ...layer, start: 1.033, in: 0, out: 0.936 }));
  });
  const output = testInfo.outputPath("placed.mp4");
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "render",
    `${directory}/project.json`,
    output,
  ]);

  // Check that the pattern covers frames 31 through 58 and the canvas shows
  // on either side, rather than the start truncating to frame 30 or ffmpeg
  // rounding the 28.08-frame duration up to 29 frames.
  const frames = await readGrayFrames(output);
  const canvas = new Uint8Array(FRAME_WIDTH * FRAME_HEIGHT);
  expect(diffFrames(frames[30], canvas)).toBeLessThan(1);
  expect(diffFrames(frames[31], canvas)).toBeGreaterThan(10);
  expect(diffFrames(frames[58], canvas)).toBeGreaterThan(10);
  expect(diffFrames(frames[59], canvas)).toBeLessThan(1);
});

/** RMS level in dB of a 20ms window of a file's audio at a time. */
async function measureRmsLevel(file: string, { time }: { time: number }) {
  const { stdout } = await execFileAsync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(time),
    "-t",
    "0.02",
    "-i",
    file,
    "-vn",
    "-af",
    "astats=metadata=1:reset=0,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
    "-f",
    "null",
    "-",
  ]);
  const levels = [...stdout.matchAll(/RMS_level=(-?[\d.]+)/g)];
  return Number(levels.at(-1)![1]);
}

const FRAME_WIDTH = 64;
const FRAME_HEIGHT = 36;

/** Every frame of a file, scaled down to small grayscale pixels. */
async function readGrayFrames(file: string) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-vf",
      `scale=${FRAME_WIDTH}:${FRAME_HEIGHT},format=gray`,
      "-f",
      "rawvideo",
      "-",
    ],
    { encoding: "buffer" },
  );
  const size = FRAME_WIDTH * FRAME_HEIGHT;
  return Array.from({ length: stdout.length / size }, (_, i) =>
    stdout.subarray(i * size, (i + 1) * size),
  );
}

/** Mean absolute difference between two grayscale frames, from 0 to 255. */
function diffFrames(a: Uint8Array, b: Uint8Array) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / a.length;
}
