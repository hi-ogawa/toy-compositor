import { createLayerName } from "./layer-defaults.ts";
import type {
  AudioLayer,
  Box,
  Canvas,
  ColorLayer,
  Crop,
  ImageLayer,
  Layer,
  Project,
  TextLayer,
  VideoLayer,
} from "./project.ts";
import { measureTextHeight } from "./render/text.ts";

export type SavedProject = Omit<
  Project,
  "canvas" | "layers" | "locators" | "media"
> & {
  canvas: Omit<Canvas, "background"> & { background?: string };
  layers: SavedLayer[];
  // Missing in projects saved before locators.
  locators?: Project["locators"];
  // Missing in projects saved before media info, filled by update-media.
  media?: Project["media"];
};

type SavedLayer = WithOptionalName<
  | SavedVideoLayer
  | SavedAudioLayer
  | SavedImageLayer
  | SavedColorLayer
  | SavedTextLayer
>;

// Missing in projects saved before layer names were required.
type WithOptionalName<T> = T extends unknown
  ? Omit<T, "name"> & { name?: string }
  : never;

// Neutral values are missing in projects saved before they were required.
type SavedVideoLayer = Omit<
  VideoLayer,
  "crop" | "muted" | "fadeIn" | "fadeOut" | "hold"
> & {
  crop?: Partial<Crop>;
  muted?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  hold?: Partial<VideoLayer["hold"]>;
};

type SavedAudioLayer = Omit<AudioLayer, "muted" | "fadeIn" | "fadeOut"> & {
  muted?: boolean;
  fadeIn?: number;
  fadeOut?: number;
};

type SavedImageLayer = Omit<ImageLayer, "crop"> & { crop?: Partial<Crop> };

type SavedColorLayer = Omit<ColorLayer, "box" | "opacity"> & {
  // Missing in projects saved before a color layer's box was required.
  box?: Box;
  opacity?: number;
};

type SavedTextLayer = Omit<TextLayer, "box" | "align" | "font"> & {
  // Missing height in projects saved before a text layer's box had one.
  box: Omit<Box, "height"> & { height?: number };
  align?: TextLayer["align"];
  font: Omit<TextLayer["font"], "weight" | "lineSpacing"> & {
    weight?: number;
    lineSpacing?: number;
  };
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
    const crop = { left: 0, right: 0, top: 0, bottom: 0 };
    switch (layer.type) {
      case "video": {
        const defaults = {
          crop,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
          hold: { before: 0, after: 0 },
        };
        layers.push(fillDefaults(layer, defaults));
        break;
      }
      case "audio": {
        const defaults = { muted: false, fadeIn: 0, fadeOut: 0 };
        layers.push(fillDefaults(layer, defaults));
        break;
      }
      case "image": {
        layers.push(fillDefaults(layer, { crop }));
        break;
      }
      case "color": {
        if (!layer.box) {
          changes.push(`${label} has no box`);
        }
        // A color layer without a box covered the canvas.
        const { width, height } = project.canvas;
        const defaults = { box: { x: 0, y: 0, width, height }, opacity: 1 };
        layers.push(fillDefaults(layer, defaults));
        break;
      }
      case "text": {
        const defaults = {
          align: "left" as const,
          font: { weight: 400, lineSpacing: 0 },
        };
        const filled = fillDefaults(layer, defaults);
        let { height } = filled.box;
        if (height === undefined) {
          // The box followed the lines, which rendered at their natural height.
          changes.push(`${label} has no box height`);
          height = await measureTextHeight(filled);
        }
        layers.push({ ...filled, box: { ...filled.box, height } });
        break;
      }
    }
  }
  const canvas = fillDefaults(project.canvas, { background: "#000000" });
  const migrated: Project = {
    ...project,
    canvas,
    layers,
    locators: project.locators ?? [],
    media: project.media ?? {},
  };
  return { project: migrated, changes };
}

/**
 * Fills each missing property with its neutral value, recursing into objects
 * that are present.
 */
function fillDefaults<T extends object, D extends object>(
  value: T,
  defaults: D,
): T & D {
  const filled = { ...value } as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(defaults)) {
    if (filled[key] === undefined) {
      filled[key] = fallback;
    } else if (typeof fallback === "object") {
      filled[key] = fillDefaults(filled[key] as object, fallback);
    }
  }
  return filled as T & D;
}
