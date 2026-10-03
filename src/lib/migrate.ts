import { readJson, writeJson } from "../utils/fs.ts";
import type { Box, ColorLayer, Layer, Project } from "./project.ts";

/** A project file as saved, which may have an older format's shape. */
export type SavedProject = Omit<Project, "layers" | "locators" | "media"> & {
  layers: SavedLayer[];
  // Missing in projects saved before locators.
  locators?: Project["locators"];
  // Missing in projects saved before media info, filled by update-media.
  media?: Project["media"];
};

type SavedLayer = Exclude<Layer, ColorLayer> | SavedColorLayer;

type SavedColorLayer = Omit<ColorLayer, "box"> & {
  // Missing in projects saved before a color layer's box was required.
  box?: Box;
};

/**
 * Migrate a project file in place, or with `check`, leave it as is, and return
 * the layer changes.
 */
export async function migrateProjectFile(
  projectFile: string,
  { check }: { check?: boolean },
) {
  const { project, changes } = migrateProject(
    await readJson<SavedProject>(projectFile),
  );
  if (changes.length > 0 && !check) {
    await writeJson(projectFile, project);
  }
  return changes;
}

/**
 * Bring a project from older formats to the current one, in the order the
 * format changed, and describe each layer change. Throw when it lacks what
 * only update-media can fill in.
 */
export function migrateProject(project: SavedProject): {
  project: Project;
  changes: string[];
} {
  validateProject(project);
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
  const migrated: Project = {
    ...project,
    layers,
    locators: project.locators ?? [],
    // Validation only lets a project without `media` through when no layer
    // uses a file, so it has none to record.
    media: project.media ?? {},
  };
  return { project: migrated, changes };
}

/**
 * Check what migrating cannot fill in, which needs a command that reads the
 * media files.
 */
function validateProject(project: SavedProject): void {
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
