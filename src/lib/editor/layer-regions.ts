import { outputRange, type Range } from "../layout.ts";
import type { Layer, Project } from "../project.ts";

/** Project-time extent before clipping to the timeline viewport. */
export function layerRange({
  layer,
  project,
}: {
  layer: Layer;
  project: Project;
}): Range {
  if (layer.type === "video" || layer.type === "audio") {
    return { start: layer.start, end: layer.start + layer.out - layer.in };
  }
  const range = outputRange(project);
  return { start: layer.start ?? range.start, end: layer.end ?? range.end };
}
