import { cp } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson } from "../src/utils/fs.ts";

test("render the synthetic sample", async ({}, testInfo) => {
  // Render a project to an MP4.
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
  // Render a still-output project to a PNG.
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
  // Keep only an audio layer that fades in and out, then cut the output into
  // both fades.
  const directory = testInfo.outputPath("project");
  await cp("samples/synthetic", directory, { recursive: true });
  await editJson<Project>(`${directory}/project.json`, (project) => {
    project.layers = project.layers.filter(
      (layer) => layer.clips[0]!.type === "audio",
    );
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

test("hold a video layer's first and last frames beyond its source range", async ({}, testInfo) => {
  // Keep only a video layer that plays in the middle of the output and holds
  // its first and last frames on each side.
  const directory = testInfo.outputPath("project");
  await cp("samples/synthetic", directory, { recursive: true });
  await editJson<Project>(`${directory}/project.json`, (project) => {
    project.layers = project.layers
      .filter((layer) => layer.clips[0]!.type === "video")
      .map((layer) => ({
        ...layer,
        clips: layer.clips.map((clip) => ({
          ...clip,
          start: 1,
          in: 1,
          out: 2,
          hold: { before: 1, after: 1 },
        })),
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

  // Check that each hold shows its edge frame, while the played part differs
  // from both.
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
