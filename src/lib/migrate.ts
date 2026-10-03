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
  const results = await Promise.all(
    project.layers.map((layer) =>
      migrateLayer(layer, { canvas: project.canvas }),
    ),
  );
  const migrated: Project = {
    ...project,
    layers: results.map((result) => result.layer),
    locators: project.locators ?? [],
    media: project.media ?? {},
  };
  return {
    project: migrated,
    changes: results.flatMap((result) => result.changes),
  };
}

async function migrateLayer(
  layer: SavedLayer,
  { canvas }: { canvas: Project["canvas"] },
): Promise<{ layer: Layer; changes: string[] }> {
  const label = `${layer.type} layer "${layer.name ?? layer.type}"`;
  if (layer.type === "color") {
    if (layer.box) {
      return { layer: { ...layer, box: layer.box }, changes: [] };
    }
    const { width, height } = canvas;
    return {
      layer: { ...layer, box: { x: 0, y: 0, width, height } },
      changes: [`${label} has no box`],
    };
  }
  if (layer.type === "text") {
    const { height } = layer.box;
    if (height !== undefined) {
      return {
        layer: { ...layer, box: { ...layer.box, height } },
        changes: [],
      };
    }
    // The box followed the lines, which rendered at their natural height.
    return {
      layer: {
        ...layer,
        box: { ...layer.box, height: await measureTextHeight(layer) },
      },
      changes: [`${label} has no box height`],
    };
  }
  return { layer, changes: [] };
}
