import { execFileAsync } from "../src/utils/exec.ts";

/** ffprobe's streams and format of a file. */
export async function probeMedia(file: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    file,
  ]);
  return JSON.parse(stdout) as {
    streams: Record<string, unknown>[];
    format: Record<string, string>;
  };
}

/** A file's stream types in order, such as `["video", "audio"]`. */
export async function readStreamTypes(file: string) {
  const { streams } = await probeMedia(file);
  return streams.map((stream) => stream.codec_type);
}

/** Decode a file's default video and audio streams, failing on the first error. */
export async function decodeMedia(file: string) {
  await execFileAsync("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-i",
    file,
    "-f",
    "null",
    "-",
  ]);
}

/** RMS level in dB of a 20ms window of a file's audio at a time. */
export async function measureRmsLevel(
  file: string,
  { time }: { time: number },
) {
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
export async function readGrayFrames(file: string) {
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
export function diffFrames(a: Uint8Array, b: Uint8Array) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / a.length;
}
