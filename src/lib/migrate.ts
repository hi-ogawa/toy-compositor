import { createLayerName } from "./layer-defaults.ts";
import {
  NEUTRAL_VALUES,
  type AudioClip,
  type Box,
  type Canvas,
  type Clip,
  type ColorClip,
  type Crop,
  type ImageClip,
  type Layer,
  type Project,
  type TextClip,
  type VideoClip,
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

type SavedLayer = SavedFlatLayer | SavedClipsLayer;

type SavedClipsLayer = Omit<Layer, "clips"> & { clips: SavedClip[] };

// Saved before layers held clips, with the layer's one clip on the layer itself.
// Missing name before layer names were required, and muted before neutral
// values were.
export type SavedFlatLayer = SavedClip & { name?: string; muted?: boolean };

type SavedClip =
  | SavedVideoClip
  | SavedAudioClip
  | SavedImageClip
  | SavedColorClip
  | SavedTextClip;

// Neutral values are missing in projects saved before they were required.
type SavedVideoClip = Omit<
  VideoClip,
  "crop" | "fadeIn" | "fadeOut" | "hold"
> & {
  crop?: Partial<Crop>;
  fadeIn?: number;
  fadeOut?: number;
  hold?: Partial<VideoClip["hold"]>;
};

type SavedAudioClip = Omit<AudioClip, "fadeIn" | "fadeOut"> & {
  fadeIn?: number;
  fadeOut?: number;
};

type SavedImageClip = Omit<ImageClip, "crop"> & { crop?: Partial<Crop> };

type SavedColorClip = Omit<ColorClip, "box" | "opacity"> & {
  // Missing in projects saved before a color clip's box was required.
  box?: Box;
  opacity?: number;
};

type SavedTextClip = Omit<TextClip, "box" | "align" | "font"> & {
  // Missing height in projects saved before a text clip's box had one.
  box: Omit<Box, "height"> & { height?: number };
  align?: TextClip["align"];
  font: Omit<TextClip["font"], "weight" | "lineSpacing"> & {
    weight?: number;
    lineSpacing?: number;
  };
};

/** A project in the current shape, and what changed to get there. */
export type MigrateProjectResult = { project: Project; changes: string[] };

/**
 * Migrate a project to the current shape, then validate it. Migration never
 * reads `media`, so it runs first, and validation only reads the current shape.
 */
export async function migrateAndValidateProject(project: SavedProject) {
  const migrated = await migrateProject(project);
  validateProject(migrated.project);
  return migrated;
}

/**
 * Reject what loading cannot fix from the file alone, which needs update-media
 * or a different file. So far this only checks each clip's media info.
 */
function validateProject(project: Project): void {
  for (const layer of project.layers) {
    for (const clip of layer.clips) {
      if (!("src" in clip)) {
        continue;
      }
      const label = `${clip.type} clip in layer "${layer.name}" (${clip.src})`;
      const mediaInfo = project.media[clip.src];
      if (!mediaInfo) {
        throw new Error(`${label} has no media info, run update-media`);
      }
      if (clip.type !== "audio" && !mediaInfo.video) {
        throw new Error(
          `${label} has no video stream, use a file with video or run update-media if the file changed`,
        );
      }
    }
    // TODO(multi-clip): Reject clips out of order by `start` or whose
    // picture ranges overlap, once the editor can put several clips on a layer.
  }
}

/**
 * Bring a project to the current shape by filling what older files lack. It
 * does not read `media` or check it, so update-media also runs it on a project
 * whose media info is missing. Each layer is normalized to the clips shape
 * first, and then each clip's fields are migrated, so a field migration works
 * whichever shape the file started in.
 */
export async function migrateProject(
  project: SavedProject,
): Promise<MigrateProjectResult> {
  const changes: string[] = [];
  const layers: Layer[] = [];
  for (const savedLayer of project.layers) {
    const { clips, ...layer } = normalizeLayer(savedLayer, {
      layers,
      changes,
    });
    layers.push({
      ...layer,
      clips: await Promise.all(
        clips.map((clip) =>
          migrateClip(clip, {
            label: `${clip.type} clip in layer "${layer.name}"`,
            canvas: project.canvas,
            changes,
          }),
        ),
      ),
    });
  }
  const canvas = fillDefaults(project.canvas, NEUTRAL_VALUES.canvas);
  const migrated: Project = {
    ...project,
    canvas,
    layers,
    locators: project.locators ?? [],
    media: project.media ?? {},
  };
  return { project: migrated, changes };
}

/** A flat layer becomes a layer with its one clip, which is lossless. */
function normalizeLayer(
  savedLayer: SavedLayer,
  {
    layers,
    changes,
  }: {
    /** The layers before it, which a missing name is numbered among. */
    layers: Layer[];
    changes: string[];
  },
): SavedClipsLayer {
  if ("clips" in savedLayer) {
    return savedLayer;
  }
  const { name: savedName, muted, ...clip } = savedLayer;
  const name = savedName ?? createLayerName({ layers, type: clip.type });
  if (savedName === undefined) {
    changes.push(`${clip.type} layer "${name}" has no name`);
  }
  changes.push(`layer "${name}" has no clips`);
  return fillDefaults({ name, muted, clips: [clip] }, NEUTRAL_VALUES.layer);
}

async function migrateClip(
  clip: SavedClip,
  {
    label,
    canvas,
    changes,
  }: { label: string; canvas: SavedProject["canvas"]; changes: string[] },
): Promise<Clip> {
  switch (clip.type) {
    case "video": {
      return fillDefaults(clip, NEUTRAL_VALUES.video);
    }
    case "audio": {
      return fillDefaults(clip, NEUTRAL_VALUES.audio);
    }
    case "image": {
      return fillDefaults(clip, NEUTRAL_VALUES.image);
    }
    case "color": {
      if (!clip.box) {
        changes.push(`${label} has no box`);
      }
      // A color clip without a box covered the canvas.
      const { width, height } = canvas;
      const box = clip.box ?? { x: 0, y: 0, width, height };
      return fillDefaults({ ...clip, box }, NEUTRAL_VALUES.color);
    }
    case "text": {
      const filled = fillDefaults(clip, NEUTRAL_VALUES.text);
      let { height } = filled.box;
      if (height === undefined) {
        // The box followed the lines, which rendered at their natural height.
        changes.push(`${label} has no box height`);
        height = await measureTextHeight(filled);
      }
      return { ...filled, box: { ...filled.box, height } };
    }
  }
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
      filled[key] = structuredClone(fallback);
    } else if (typeof fallback === "object") {
      filled[key] = fillDefaults(filled[key] as object, fallback);
    }
  }
  return filled as T & D;
}
