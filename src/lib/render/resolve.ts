import path from "node:path";
import type { Project, TextClip } from "../project.ts";
import { renderText } from "./text.ts";

export type Resolved = {
  /** Text PNG files keyed by the project's text clips. */
  texts: Map<TextClip, string>;
};

/**
 * Render the derived assets a project needs before compiling. Each text clip
 * is drawn to a PNG in textDir, so compile() can build ffmpeg arguments
 * without any I/O.
 */
export async function resolveProject({
  project,
  textDir,
}: {
  project: Project;
  textDir: string;
}): Promise<Resolved> {
  const texts = new Map<TextClip, string>();
  for (const layer of project.layers) {
    for (const clip of layer.clips) {
      if (clip.type === "text") {
        const file = path.join(textDir, `${texts.size}.png`);
        await renderText({ clip, file });
        texts.set(clip, file);
      }
    }
  }
  return { texts };
}
