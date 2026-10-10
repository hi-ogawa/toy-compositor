import { createLayerName } from "./layer-defaults.ts";
import { findMisplacedClip, getCroppedBox } from "./layout.ts";
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
  type Size,
  type TextClip,
  type Transform,
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

type SavedClipsLayer = Omit<Layer, "clips" | "hidden"> & {
  // Projects saved before layers could be hidden have none.
  hidden?: boolean;
  clips: SavedClip[];
};

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

// Projects saved before transforms fit the source inside a box instead.
type SavedPlacement = { transform?: Transform; box?: Box };

// Neutral values are missing in projects saved before they were required.
type SavedVideoClip = Omit<
  VideoClip,
  "transform" | "crop" | "fadeIn" | "fadeOut" | "hold"
> &
  SavedPlacement & {
    crop?: Partial<Crop>;
    fadeIn?: number;
    fadeOut?: number;
    hold?: Partial<VideoClip["hold"]>;
  };

type SavedAudioClip = Omit<AudioClip, "fadeIn" | "fadeOut"> & {
  fadeIn?: number;
  fadeOut?: number;
};

type SavedImageClip = Omit<ImageClip, "transform" | "crop"> &
  SavedPlacement & { crop?: Partial<Crop> };

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

export type MigrateProjectResult = { project: Project; changes: string[] };

/**
 * Migration runs first because it reads `media` only for a fit box's source
 * size, and validation reads only the current shape.
 */
export async function migrateAndValidateProject(project: SavedProject) {
  const migrated = await migrateProject(project);
  validateProject(migrated.project);
  return migrated;
}

/**
 * Reject what loading cannot fix from the file alone, which needs update-media
 * or a different file.
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
    const index = findMisplacedClip(layer.clips);
    if (index !== undefined) {
      throw new Error(
        `clip ${index} in layer "${layer.name}" starts before the previous clip or overlaps its picture`,
      );
    }
  }
}

/**
 * It reads `media` only for a fit box's source size and does not check it, so
 * update-media also runs it on a project whose media info is missing. Layers
 * are normalized to the clips shape before clip fields migrate, so a field
 * migration works whichever shape the file started in.
 */
export async function migrateProject(
  project: SavedProject,
): Promise<MigrateProjectResult> {
  const changes: string[] = [];
  const layers: Layer[] = [];
  for (const savedLayer of project.layers) {
    const { clips, ...layer } = normalizeLayer({
      savedLayer,
      layers,
      changes,
    });
    layers.push({
      ...layer,
      clips: await Promise.all(
        clips.map((clip) =>
          migrateClip({
            clip,
            label: `${clip.type} clip in layer "${layer.name}"`,
            canvas: project.canvas,
            media: project.media,
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
function normalizeLayer({
  savedLayer,
  layers,
  changes,
}: {
  savedLayer: SavedLayer;
  /** The layers before it, which a missing name is numbered among. */
  layers: Layer[];
  changes: string[];
}): Omit<Layer, "clips"> & { clips: SavedClip[] } {
  if ("clips" in savedLayer) {
    return fillDefaults(savedLayer, NEUTRAL_VALUES.layer);
  }
  const { name: savedName, muted, ...clip } = savedLayer;
  const name = savedName ?? createLayerName({ layers, type: clip.type });
  if (savedName === undefined) {
    changes.push(`${clip.type} layer "${name}" has no name`);
  }
  changes.push(`layer "${name}" has no clips`);
  return fillDefaults({ name, muted, clips: [clip] }, NEUTRAL_VALUES.layer);
}

async function migrateClip({
  clip,
  label,
  canvas,
  media,
  changes,
}: {
  clip: SavedClip;
  label: string;
  canvas: SavedProject["canvas"];
  media: SavedProject["media"];
  changes: string[];
}): Promise<Clip> {
  switch (clip.type) {
    case "video": {
      const { box, ...filled } = fillDefaults(clip, NEUTRAL_VALUES.video);
      const transform = migrateTransform({
        clip: { ...filled, box },
        label,
        media,
        changes,
      });
      return { ...filled, transform };
    }
    case "audio": {
      return fillDefaults(clip, NEUTRAL_VALUES.audio);
    }
    case "image": {
      const { box, ...filled } = fillDefaults(clip, NEUTRAL_VALUES.image);
      const transform = migrateTransform({
        clip: { ...filled, box },
        label,
        media,
        changes,
      });
      return { ...filled, transform };
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

function migrateTransform({
  clip,
  label,
  media,
  changes,
}: {
  clip: { src: string; crop: Crop } & SavedPlacement;
  label: string;
  media: SavedProject["media"];
  changes: string[];
}): Transform {
  if (clip.transform) {
    return clip.transform;
  }
  changes.push(`${label} has a fit box instead of a transform`);
  return convertFitBox({
    box: clip.box!,
    size: media![clip.src].video!,
    crop: clip.crop,
  });
}

/** The transform that puts what the crop leaves where the old fit drew it. */
function convertFitBox({
  box,
  size,
  crop,
}: {
  box: Box;
  size: Size;
  crop: Crop;
}): Transform {
  const cropped = getCroppedBox({ size, crop });
  // The fit scaled the cropped region until it touched the box, keeping its
  // aspect ratio.
  const scale = Math.min(
    box.width / cropped.width,
    box.height / cropped.height,
  );
  // It then centered the region's even-rounded size in the box, which put the
  // region's corner here.
  const corner = {
    x: Math.round(box.x + (box.width - roundToEven(cropped.width * scale)) / 2),
    y: Math.round(
      box.y + (box.height - roundToEven(cropped.height * scale)) / 2,
    ),
  };
  return {
    x: corner.x - cropped.x * scale,
    y: corner.y - cropped.y * scale,
    scale,
  };
}

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

/** The old fit rounded placed sizes to even pixels. */
function roundToEven(n: number) {
  return Math.max(2, 2 * Math.round(n / 2));
}
