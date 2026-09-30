import path from "node:path";
import type { Project } from "../project.ts";
import { renderText } from "./text.ts";

export type Resolved = {
  /** Text PNG files keyed by layer index. */
  texts: Map<number, string>;
};

/**
 * Render the derived assets a project needs before compiling. Each text layer
 * is drawn to a PNG in textDir, so compile() can build ffmpeg arguments
 * without any I/O. Media info needs no step here, because the project already
 * carries it.
 */
export async function resolveProject({
  project,
  textDir,
}: {
  project: Project;
  textDir: string;
}): Promise<Resolved> {
  const texts = new Map<number, string>();
  for (const [i, layer] of project.layers.entries()) {
    if (layer.type === "text") {
      const file = path.join(textDir, `${i}.png`);
      await renderText({ layer, file });
      texts.set(i, file);
    }
  }
  return { texts };
}
