import path from "node:path";
import { execFileAsync } from "../utils/exec.ts";
import { readJson, writeJson } from "../utils/fs.ts";
import type { Project, Source } from "./project.ts";

/**
 * Probe every media file a project file's layers use and write the facts into
 * its `sources`, replacing what was there.
 */
export async function updateProjectSources(projectFile: string) {
  const project = await readJson<Project>(projectFile);
  const projectDir = path.dirname(path.resolve(projectFile));
  const sources: Project["sources"] = {};
  for (const layer of project.layers) {
    if ("src" in layer && !sources[layer.src]) {
      sources[layer.src] = await probeSource(
        path.resolve(projectDir, layer.src),
      );
    }
  }
  await writeJson(projectFile, { ...project, sources });
}

/** Read a media file's time range, video size and frame timing, and whether it has audio. */
export async function probeSource(file: string): Promise<Source> {
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
