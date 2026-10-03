import { createLayerName } from "./layer-defaults.ts";
import type { Box, ColorLayer, Layer, Project, TextLayer } from "./project.ts";
import { measureTextHeight } from "./render/text.ts";

export type SavedProject = Omit<Project, "layers" | "locators" | "media"> & {
  layers: SavedLayer[];
  // Missing in projects saved before locators.
  locators?: Project["locators"];
  // Missing in projects saved before media info, filled by update-media.
  media?: Project["media"];
};

type SavedLayer = WithOptionalName<
  Exclude<Layer, ColorLayer | TextLayer> | SavedColorLayer | SavedTextLayer
>;

// Missing in projects saved before layer names were required.
type WithOptionalName<T> = T extends unknown
  ? Omit<T, "name"> & { name?: string }
  : never;

type SavedColorLayer = Omit<ColorLayer, "box"> & {
  // Missing in projects saved before a color layer's box was required.
  box?: Box;
};

type SavedTextLayer = Omit<TextLayer, "box"> & {
  // Missing height in projects saved before a text layer's box had one.
  box: Omit<Box, "height"> & { height?: number };
};

/** A project in the current shape, and what changed to get there. */
export type MigrateProjectResult = { project: Project; changes: string[] };

export async function validateAndMigrateProject(project: SavedProject) {
  validateProject(project);
  return migrateProject(project);
}

/**
 * Reject what loading cannot fix from the file alone, which needs update-media
 * or a different file.
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

async function migrateProject(
  project: SavedProject,
): Promise<MigrateProjectResult> {
  const changes: string[] = [];
  const layers: Layer[] = [];
  for (const savedLayer of project.layers) {
    const name =
      savedLayer.name ?? createLayerName({ layers, type: savedLayer.type });
    const layer = { ...savedLayer, name };
    const label = `${layer.type} layer "${name}"`;
    if (savedLayer.name === undefined) {
      changes.push(`${label} has no name`);
    }
    if (layer.type === "color") {
      if (!layer.box) {
        changes.push(`${label} has no box`);
      }
      const { width, height } = project.canvas;
      layers.push({
        ...layer,
        box: layer.box ?? { x: 0, y: 0, width, height },
      });
      continue;
    }
    if (layer.type === "text") {
      let { height } = layer.box;
      if (height === undefined) {
        // The box followed the lines, which rendered at their natural height.
        changes.push(`${label} has no box height`);
        height = await measureTextHeight(layer);
      }
      layers.push({ ...layer, box: { ...layer.box, height } });
      continue;
    }
    layers.push(layer);
  }
  const migrated: Project = {
    ...project,
    layers,
    locators: project.locators ?? [],
    media: project.media ?? {},
  };
  return { project: migrated, changes };
}
