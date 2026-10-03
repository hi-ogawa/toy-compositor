import { getCroppedSize, roundToEven } from "./layout.ts";
import type {
  Box,
  ColorLayer,
  Crop,
  ImageLayer,
  Layer,
  MediaInfo,
  Project,
  Transform,
  VideoLayer,
} from "./project.ts";

export type SavedProject = Omit<Project, "layers" | "locators" | "media"> & {
  layers: SavedLayer[];
  // Missing in projects saved before locators.
  locators?: Project["locators"];
  // Missing in projects saved before media info, filled by update-media.
  media?: Project["media"];
};

type SavedLayer =
  | Exclude<Layer, ColorLayer | VideoLayer | ImageLayer>
  | SavedColorLayer
  | SavedMediaLayer<VideoLayer>
  | SavedMediaLayer<ImageLayer>;

type SavedColorLayer = Omit<ColorLayer, "box"> & {
  // Missing in projects saved before a color layer's box was required.
  box?: Box;
};

type SavedMediaLayer<T extends VideoLayer | ImageLayer> = Omit<
  T,
  "transform"
> & {
  // Projects saved before transforms fit the source inside a box instead.
  transform?: Transform;
  box?: Box;
};

/** A project in the current shape, and what changed to get there. */
export type MigrateProjectResult = { project: Project; changes: string[] };

export function validateAndMigrateProject(project: SavedProject) {
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

function migrateProject(project: SavedProject): MigrateProjectResult {
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
    if (layer.type === "video" || layer.type === "image") {
      const { box, transform, ...rest } = layer;
      if (transform) {
        return { ...rest, transform };
      }
      changes.push(`${label} has a fit box instead of a transform`);
      return {
        ...rest,
        transform: convertFitBox({
          box: box!,
          mediaInfo: project.media![layer.src],
          crop: layer.crop,
        }),
      };
    }
    return layer;
  });
  const migrated: Project = {
    ...project,
    layers,
    locators: project.locators ?? [],
    media: project.media ?? {},
  };
  return { project: migrated, changes };
}

/**
 * The transform that places the source where the old fit put it: the cropped
 * source scaled to fit inside the box, keeping its aspect ratio, and centered
 * in it.
 */
function convertFitBox({
  box,
  mediaInfo,
  crop = {},
}: {
  box: Box;
  mediaInfo: MediaInfo;
  crop?: Crop;
}): Transform {
  const source = mediaInfo.video!;
  const cropped = getCroppedSize({ source, crop });
  const scale = Math.min(
    box.width / cropped.width,
    box.height / cropped.height,
  );
  // The fitted rectangle is the visible part, so step back over the hidden
  // left and top edges to the whole source's corner.
  const width = roundToEven(cropped.width * scale);
  const height = roundToEven(cropped.height * scale);
  return {
    x:
      Math.round(box.x + (box.width - width) / 2) -
      (crop.left ?? 0) * source.width * scale,
    y:
      Math.round(box.y + (box.height - height) / 2) -
      (crop.top ?? 0) * source.height * scale,
    scale,
  };
}
