// Resolve the source facts and derived assets a project needs before compiling.
// Each video and image source is probed once, and each text layer is rendered
// to a PNG, so compile() can build ffmpeg arguments without doing any I/O.

import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Project } from "../project.ts";
import { renderText } from "./text.ts";

export type Resolved = {
  // Keyed by layer src.
  media: Map<string, Media>;
  // Text PNG files keyed by layer index.
  texts: Map<number, string>;
};

export type Media = {
  width: number;
  height: number;
  startTime: number;
  frameRate: number;
  hasAudio: boolean;
};

export function resolveProject({
  project,
  projectDir,
  outFile,
}: {
  project: Project;
  projectDir: string;
  outFile: string;
}): Resolved {
  const media = new Map<string, Media>();
  const texts = new Map<number, string>();
  project.layers.forEach((layer, i) => {
    switch (layer.type) {
      case "video":
      case "image": {
        if (!media.has(layer.src)) {
          media.set(layer.src, probeMedia(path.resolve(projectDir, layer.src)));
        }
        return;
      }
      case "text": {
        const file = path.join(
          path.dirname(outFile),
          ".text",
          `${path.basename(outFile)}.${i}.png`,
        );
        renderText({ layer, file });
        texts.set(i, file);
        return;
      }
    }
  });
  return { media, texts };
}

function probeMedia(file: string): Media {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height,start_time,r_frame_rate",
    "-of",
    "json",
    file,
  ]).toString();
  const streams: {
    codec_type: string;
    width: number;
    height: number;
    start_time?: string;
    r_frame_rate: string;
  }[] = JSON.parse(out).streams;
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
