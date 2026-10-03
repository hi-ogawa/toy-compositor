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
  canvas: WithOptional<Canvas, "background">;
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
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type SavedVideoLayer = Omit<
  WithOptional<VideoLayer, "muted" | "fadeIn" | "fadeOut">,
  "crop" | "hold"
> & { crop?: Partial<Crop>; hold?: Partial<VideoLayer["hold"]> };

type SavedAudioLayer = WithOptional<AudioLayer, "muted" | "fadeIn" | "fadeOut">;

type SavedImageLayer = Omit<ImageLayer, "crop"> & { crop?: Partial<Crop> };

// The box is missing in projects saved before a color layer's box was required.
type SavedColorLayer = WithOptional<ColorLayer, "box" | "opacity">;

type SavedTextLayer = Omit<TextLayer, "box" | "align" | "font"> & {
  // Missing height in projects saved before a text layer's box had one.
  box: Omit<Box, "height"> & { height?: number };
  align?: TextLayer["align"];
  font: WithOptional<TextLayer["font"], "weight" | "lineSpacing">;
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
    const missing: string[] = [];
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
        layers.push(fillDefaults(layer, defaults, { missing }));
        break;
      }
      case "audio": {
        const defaults = { muted: false, fadeIn: 0, fadeOut: 0 };
        layers.push(fillDefaults(layer, defaults, { missing }));
        break;
      }
      case "image": {
        layers.push(fillDefaults(layer, { crop }, { missing }));
        break;
      }
      case "color": {
        // A color layer without a box covered the canvas.
        const { width, height } = project.canvas;
        const defaults = { box: { x: 0, y: 0, width, height }, opacity: 1 };
        layers.push(fillDefaults(layer, defaults, { missing }));
        break;
      }
      case "text": {
        const defaults = {
          align: "left" as const,
          font: { weight: 400, lineSpacing: 0 },
        };
        const filled = fillDefaults(layer, defaults, { missing });
        let { height } = filled.box;
        if (height === undefined) {
          // The box followed the lines, which rendered at their natural height.
          missing.push("box.height");
          height = await measureTextHeight(filled);
        }
        layers.push({ ...filled, box: { ...filled.box, height } });
        break;
      }
    }
    if (missing.length > 0) {
      changes.push(`${label} has no ${missing.join(", ")}`);
    }
  }
  const missing: string[] = [];
  const canvas = fillDefaults(
    project.canvas,
    { background: "#000000" },
    { missing },
  );
  if (missing.length > 0) {
    changes.push(`canvas has no ${missing.join(", ")}`);
  }
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
 * that are present, and adds the filled property paths to `missing`.
 */
function fillDefaults<T extends object, D extends object>(
  value: T,
  defaults: D,
  { missing, prefix = "" }: { missing: string[]; prefix?: string },
): T & D {
  const filled = { ...value } as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(defaults)) {
    if (filled[key] === undefined) {
      filled[key] = fallback;
      missing.push(prefix + key);
    } else if (typeof fallback === "object") {
      filled[key] = fillDefaults(filled[key] as object, fallback, {
        missing,
        prefix: `${prefix}${key}.`,
      });
    }
  }
  return filled as T & D;
}
