import path from "node:path";
import { execFileAsync } from "../utils/exec.ts";
import { readJson, writeJson } from "../utils/fs.ts";
import { migrateProject, type SavedProject } from "./migrate.ts";
import type { Project, MediaInfo } from "./project.ts";

/**
 * Probe every media file a project file's clips use and write their media info
 * into the project's `media`, replacing what was there. The project is written
 * in the current shape, migrated as on load, after probing, because migrating
 * a fit box needs the source size.
 */
export async function updateProjectMedia(projectFile: string) {
  const savedProject = await readJson<SavedProject>(projectFile);
  const projectDir = path.dirname(path.resolve(projectFile));
  const mediaInfoMap: Project["media"] = {};
  // Layers saved before clips hold their one clip on the layer itself.
  const clips = savedProject.layers.flatMap((layer) =>
    "clips" in layer ? layer.clips : [layer],
  );
  for (const clip of clips) {
    if ("src" in clip && !mediaInfoMap[clip.src]) {
      mediaInfoMap[clip.src] = await probeMediaInfo(
        path.resolve(projectDir, clip.src),
      );
    }
  }
  const { project } = await migrateProject({
    ...savedProject,
    media: mediaInfoMap,
  });
  await writeJson(projectFile, project);
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
