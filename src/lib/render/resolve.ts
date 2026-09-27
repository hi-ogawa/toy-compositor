import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { Project } from "../project.ts";
import { renderText } from "./text.ts";

const execFileAsync = promisify(execFile);

export type Resolved = {
  /** Keyed by layer src. */
  media: Map<string, Media>;
  /** Text PNG files keyed by layer index. */
  texts: Map<number, string>;
};

export type Media = {
  width: number;
  height: number;
  startTime: number;
  frameRate: number;
  hasAudio: boolean;
};

/**
 * Resolve the source facts and derived assets a project needs before compiling.
 * Each video and image source is probed once, and each text layer is rendered
 * to a PNG, so compile() can build ffmpeg arguments without doing any I/O.
 */
export async function resolveProject({
  project,
  projectDir,
  outFile,
}: {
  project: Project;
  projectDir: string;
  outFile: string;
}): Promise<Resolved> {
  const media = new Map<string, Media>();
  const texts = new Map<number, string>();
  for (const [i, layer] of project.layers.entries()) {
    switch (layer.type) {
      case "video":
      case "image": {
        if (!media.has(layer.src)) {
          media.set(
            layer.src,
            await probeMedia(path.resolve(projectDir, layer.src)),
          );
        }
        break;
      }
      case "text": {
        const file = path.join(
          path.dirname(outFile),
          ".text",
          `${path.basename(outFile)}.${i}.png`,
        );
        await renderText({ layer, file });
        texts.set(i, file);
        break;
      }
    }
  }
  return { media, texts };
}

async function probeMedia(file: string): Promise<Media> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height,start_time,r_frame_rate",
    "-of",
    "json",
    file,
  ]);
  const streams: {
    codec_type: string;
    width: number;
    height: number;
    start_time?: string;
    r_frame_rate: string;
  }[] = JSON.parse(stdout).streams;
  const video = streams.find((s) => s.codec_type === "video")!;
  const [num, den] = video.r_frame_rate.split("/").map(Number);
  return {
    width: video.width,
    height: video.height,
    startTime: Number(video.start_time ?? 0),
    frameRate: num / den,
    hasAudio: streams.some((s) => s.codec_type === "audio"),
  };
}
