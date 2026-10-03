import { readJson, writeJson } from "../utils/fs.ts";
import type { Project } from "./project.ts";

/**
 * Rewrite a project file from older formats to the current one, or with
 * `check`, leave it as is. Return a description of each layer change, such as
 * `color layer "Tint" has no box`.
 */
export async function migrateProjectFile(
  projectFile: string,
  { check }: { check?: boolean },
) {
  const project = await readJson<Project>(projectFile);
  const changes: string[] = [];
  // Fixups go in the order the format changed. The format has no version, so
  // each recognizes its own old shape, and a second run changes nothing.
  const layers = project.layers.map((layer) => {
    const label = `${layer.type} layer "${layer.name ?? layer.type}"`;
    // A color layer's box became required, and without one it covered the
    // whole canvas.
    if (layer.type === "color" && !layer.box) {
      changes.push(`${label} has no box`);
      const { width, height } = project.canvas;
      layer = { ...layer, box: { x: 0, y: 0, width, height } };
    }
    return layer;
  });
  if (changes.length > 0 && !check) {
    await writeJson(projectFile, { ...project, layers });
  }
  return changes;
}
