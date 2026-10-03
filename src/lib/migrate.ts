import type { Box, ColorLayer, Layer, Project, TextLayer } from "./project.ts";
import { measureTextHeight } from "./render/text.ts";

export type SavedProject = Omit<Project, "layers" | "locators" | "media"> & {
  layers: SavedLayer[];
  // Missing in projects saved before locators.
  locators?: Project["locators"];
  // Missing in projects saved before media info, filled by update-media.
  media?: Project["media"];
};

type SavedLayer =
  | Exclude<Layer, ColorLayer | TextLayer>
  | SavedColorLayer
  | SavedTextLayer;

type SavedColorLayer = Omit<ColorLayer, "box"> & {
  // Missing in projects saved before a color layer's box was required.
  box?: Box;
};

type SavedTextLayer = Omit<TextLayer, "box"> & {
  // Missing height in projects saved before a text layer's box had one.
  box: Omit<Box, "height"> & { height?: number };
};

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

async function migrateProject(project: SavedProject): Promise<{
  project: Project;
  changes: string[];
}> {
  const changes: string[] = [];
  const layers = await Promise.all(
    project.layers.map((layer) =>
      migrateLayer(layer, { canvas: project.canvas, changes }),
    ),
  );
  const migrated: Project = {
    ...project,
    layers,
    locators: project.locators ?? [],
    media: project.media ?? {},
  };
  return { project: migrated, changes };
}

/** Bring one layer to the current shape, recording each change it needs. */
async function migrateLayer(
  layer: SavedLayer,
  { canvas, changes }: { canvas: Project["canvas"]; changes: string[] },
): Promise<Layer> {
  const label = `${layer.type} layer "${layer.name ?? layer.type}"`;
  if (layer.type === "color") {
    if (!layer.box) {
      changes.push(`${label} has no box`);
    }
    const { width, height } = canvas;
    return { ...layer, box: layer.box ?? { x: 0, y: 0, width, height } };
  }
  if (layer.type === "text") {
    let { height } = layer.box;
    if (height === undefined) {
      // The box followed the lines, which rendered at their natural height.
      changes.push(`${label} has no box height`);
      height = await measureTextHeight(layer);
    }
    return { ...layer, box: { ...layer.box, height } };
  }
  return layer;
}
