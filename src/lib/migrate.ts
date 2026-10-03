import type { Box, ColorLayer, Layer, Project } from "./project.ts";

/** A project file as saved, which may have an older format's shape. */
export type SavedProject = Omit<Project, "layers" | "media"> & {
  layers: SavedLayer[];
  // Missing in projects saved before media info, filled by update-media.
  media?: Project["media"];
};

type SavedLayer =
  | Exclude<Layer, ColorLayer>
  | (Omit<ColorLayer, "box"> & {
      // Missing in projects saved before a color layer's box was required.
      box?: Box;
    });

/** A saved project whose facts normalizing can rely on. */
type ValidProject = SavedProject & Pick<Project, "media">;

/**
 * Check what normalizing cannot fill in, which needs a command that reads the
 * media files.
 */
export function validateProject(
  project: SavedProject,
): asserts project is ValidProject {
  for (const layer of project.layers) {
    if (!("src" in layer)) {
      continue;
    }
    const label = `${layer.type} layer "${layer.name ?? layer.type}" (${layer.src})`;
    const mediaInfo = project.media?.[layer.src];
    if (!mediaInfo) {
      throw new Error(`${label} has no media info, run update-media`);
    }
    if (layer.type !== "audio" && !mediaInfo.video) {
      throw new Error(
        `${label} has no video stream, use a file with video or run update-media if the file changed`,
      );
    }
  }
}

/**
 * Bring a project from older formats to the current one, in the order the
 * format changed, and describe each layer change.
 */
export function normalizeProject(project: ValidProject): {
  project: Project;
  changes: string[];
} {
  const changes: string[] = [];
  const layers = project.layers.map((layer): Layer => {
    const label = `${layer.type} layer "${layer.name ?? layer.type}"`;
    if (layer.type === "color") {
      if (!layer.box) {
        changes.push(`${label} has no box`);
      }
      const { width, height } = project.canvas;
      return { ...layer, box: layer.box ?? { x: 0, y: 0, width, height } };
    }
    return layer;
  });
  return { project: { ...project, layers }, changes };
}
