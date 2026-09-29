import { execFileAsync } from "../utils/exec.ts";

export type ProbedMedia = {
  /** Container start time, which source times such as `in` and `out` include. */
  start: number;
  /** Container duration, 0 for a still image. */
  duration: number;
  video?: {
    width: number;
    height: number;
    /** The video stream's own start time, which frame timing counts from. */
    startTime: number;
    frameRate: number;
  };
  hasAudio: boolean;
};

/** Read a media file's timing, video size, and streams with ffprobe. */
export async function probeMedia(file: string): Promise<ProbedMedia> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height,start_time,r_frame_rate:format=start_time,duration",
    "-of",
    "json",
    file,
  ]);
  const { streams, format } = JSON.parse(stdout) as {
    streams: {
      codec_type: string;
      width: number;
      height: number;
      start_time?: string;
      r_frame_rate: string;
    }[];
    format: { start_time?: string; duration?: string };
  };
  const video = streams.find((s) => s.codec_type === "video");
  const [num, den] = video?.r_frame_rate.split("/").map(Number) ?? [];
  return {
    start: Number(format.start_time ?? 0),
    duration: Number(format.duration ?? 0),
    video: video && {
      width: video.width,
      height: video.height,
      startTime: Number(video.start_time ?? 0),
      frameRate: num / den,
    },
    hasAudio: streams.some((s) => s.codec_type === "audio"),
  };
}
