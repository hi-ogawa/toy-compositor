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
  const canvas = new Uint8Array(frames[0].length);
  expect(diffFrames(frames[30], canvas)).toBeLessThan(1);
  expect(diffFrames(frames[31], canvas)).toBeGreaterThan(10);
  expect(diffFrames(frames[58], canvas)).toBeGreaterThan(10);
  expect(diffFrames(frames[59], canvas)).toBeLessThan(1);
});

test("hold a video layer's first and last frames beyond its source range", async ({}, testInfo) => {
  // Copy the synthetic sample and keep only its test pattern, playing source
  // 1s to 2s at 1s and holding its first and last frames for 1s on each side.
  //
  //   |  hold  |  play  |  hold  |
  //   0        1        2        3
  //               1.5
  const directory = testInfo.outputPath("project");
  await cp("samples/synthetic", directory, { recursive: true });
  await editJson<Project>(`${directory}/project.json`, (project) => {
    project.layers = project.layers
      .filter((layer) => layer.type === "video")
      .map((layer) => ({
        ...layer,
        start: 1,
        in: 1,
        out: 2,
        hold: { before: 1, after: 1 },
      }));
  });
  const output = testInfo.outputPath("hold.mp4");
  await execFileAsync(process.execPath, [
    "src/cli.ts",
    "render",
    `${directory}/project.json`,
    output,
  ]);
  await testInfo.attach("held render", {
    path: output,
    contentType: "video/mp4",
  });

  // Check that 0 s shows the same frame as 1 s and 2 s the same as the end,
  // while 1.5 s differs from both.
  const fps = 30;
  const frames = await readGrayFrames(output);
  expect(frames).toHaveLength(3 * fps);
  expect(diffFrames(frames[0], frames[fps])).toBeLessThan(0.1);
  expect(diffFrames(frames[2 * fps], frames.at(-1)!)).toBeLessThan(0.1);
  expect(diffFrames(frames[0], frames[1.5 * fps])).toBeGreaterThan(1);
  expect(diffFrames(frames[1.5 * fps], frames.at(-1)!)).toBeGreaterThan(1);

  // Render stills inside each hold, and check that each matches the render's
  // frames there, within the video encode's loss.
  const renderStill = async (time: number) => {
    const file = `${directory}/still-${time}.json`;
    await cp(`${directory}/project.json`, file);
    await editJson<Project>(file, (project) => {
      project.output = { type: "still", time };
    });
    const still = testInfo.outputPath(`still-${time}.png`);
    await execFileAsync(process.execPath, [
      "src/cli.ts",
      "render",
      file,
      still,
    ]);
    const [frame] = await readGrayFrames(still);
    return frame;
  };
  expect(diffFrames(await renderStill(0.5), frames[0])).toBeLessThan(1);
  expect(diffFrames(await renderStill(2.5), frames.at(-1)!)).toBeLessThan(1);
});

test("hold the frame a layer shows on its last output frame when its edges are off the frame grid", async ({}, testInfo) => {
  // Copy the synthetic sample and keep only its test pattern, playing source
  // 1s to 1.97s at 1.015s and holding its last frame for 1s. It ends at
  // 1.985s, nearest frame 60, so its last output frame is 59.
  const directory = testInfo.outputPath("project");
  await cp("samples/synthetic", directory, { recursive: true });
  await editJson<Project>(`${directory}/project.json`, (project) => {
    project.layers = project.layers
      .filter((layer) => layer.type === "video")
      .map((layer) => ({
        ...layer,
        start: 1.015,
        in: 1,
        out: 1.97,
        hold: { after: 1 },
      }));
  });

  // Render a still inside the hold and one on frame 59, and check that the
  // hold shows exactly that frame.
  const renderStill = async (time: number) => {
    const file = `${directory}/still-${time}.json`;
    await cp(`${directory}/project.json`, file);
    await editJson<Project>(file, (project) => {
      project.output = { type: "still", time };
    });
    const still = testInfo.outputPath(`still-${time}.png`);
    await execFileAsync(process.execPath, [
      "src/cli.ts",
      "render",
      file,
      still,
    ]);
    const [frame] = await readGrayFrames(still);
    return frame;
  };
  expect(diffFrames(await renderStill(2.5), await renderStill(59 / 30))).toBe(
    0,
  );
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

/** Every frame of a file, scaled down to small grayscale pixels. */
async function readGrayFrames(file: string) {
  const width = 64;
  const height = 36;
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-vf",
      `scale=${width}:${height},format=gray`,
      "-f",
      "rawvideo",
      "-",
    ],
    { encoding: "buffer" },
  );
  const size = width * height;
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
