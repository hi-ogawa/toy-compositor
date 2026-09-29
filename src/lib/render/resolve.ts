import path from "node:path";
import { probeMedia } from "../probe.ts";
import type { Project } from "../project.ts";
import { renderText } from "./text.ts";

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
 * to a PNG in textDir, so compile() can build ffmpeg arguments without any I/O.
 */
export async function resolveProject({
  project,
  projectDir,
  textDir,
}: {
  project: Project;
  projectDir: string;
  textDir: string;
}): Promise<Resolved> {
  const media = new Map<string, Media>();
  const texts = new Map<number, string>();
  for (const [i, layer] of project.layers.entries()) {
    switch (layer.type) {
      case "video":
      case "image": {
        if (!media.has(layer.src)) {
          const probed = await probeMedia(path.resolve(projectDir, layer.src));
          media.set(layer.src, { ...probed.video!, hasAudio: probed.hasAudio });
        }
        break;
      }
      case "text": {
        const file = path.join(textDir, `${i}.png`);
        await renderText({ layer, file });
        texts.set(i, file);
        break;
      }
    }
  }
  return { media, texts };
}
