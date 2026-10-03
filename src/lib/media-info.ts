import path from "node:path";
import { execFileAsync } from "../utils/exec.ts";
import { readJson, writeJson } from "../utils/fs.ts";
import { getSavedClips, type SavedProject } from "./migrate.ts";
import type { Project, MediaInfo } from "./project.ts";

/**
 * Probe every media file a project file's clips use and write their media info
 * into the project's `media`, replacing what was there.
 */
export async function updateProjectMedia(projectFile: string) {
  const project = await readJson<SavedProject>(projectFile);
  const projectDir = path.dirname(path.resolve(projectFile));
  const mediaInfoMap: Project["media"] = {};
  for (const clip of project.layers.flatMap(getSavedClips)) {
    if ("src" in clip && !mediaInfoMap[clip.src]) {
      mediaInfoMap[clip.src] = await probeMediaInfo(
        path.resolve(projectDir, clip.src),
      );
    }
  }
  await writeJson(projectFile, { ...project, media: mediaInfoMap });
}

/** Read a media file's time range, video size and frame timing, and whether it has audio. */
export async function probeMediaInfo(file: string): Promise<MediaInfo> {
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
  const start = Number(format.start_time ?? 0);
  return {
    start,
    // ffprobe reports microseconds, so rounding drops only floating-point noise.
    end: Number((start + Number(format.duration ?? 0)).toFixed(6)),
    ...(video && {
      video: {
        width: video.width,
        height: video.height,
        startTime: Number(video.start_time ?? 0),
        frameRate: num / den,
      },
    }),
    audio: streams.some((s) => s.codec_type === "audio"),
  };
}
