import { createLayerName } from "./layer-defaults.ts";
import type {
  Box,
  Canvas,
  Clip,
  ColorClip,
  Layer,
  Project,
  TextClip,
} from "./project.ts";
import { measureTextHeight } from "./render/text.ts";

export type SavedProject = Omit<Project, "layers" | "locators" | "media"> & {
  layers: SavedLayer[];
  // Missing in projects saved before locators.
  locators?: Project["locators"];
  // Missing in projects saved before media info, filled by update-media.
  media?: Project["media"];
};

type SavedLayer = SavedFlatLayer | SavedClipsLayer;

type SavedClipsLayer = Omit<Layer, "clips"> & { clips: SavedClip[] };

// Saved before layers held clips, with the layer's one clip on the layer itself.
type SavedFlatLayer = WithFlatLayerFields<SavedClip>;

type WithFlatLayerFields<T> = T extends unknown
  ? // Missing name in projects saved before layer names were required.
    T & { name?: string; muted?: boolean }
  : never;

type SavedClip =
  | Exclude<Clip, ColorClip | TextClip>
  | SavedColorClip
  | SavedTextClip;

type SavedColorClip = Omit<ColorClip, "box"> & {
  // Missing in projects saved before a color clip's box was required.
  box?: Box;
};

type SavedTextClip = Omit<TextClip, "box"> & {
  // Missing height in projects saved before a text clip's box had one.
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
    const clips = getSavedClips(layer);
    const layerLabel = `layer "${layer.name ?? clips[0]!.type}"`;
    for (const clip of clips) {
      if (!("src" in clip)) {
        continue;
      }
      const label = `${clip.type} clip in ${layerLabel} (${clip.src})`;
      const mediaInfo = project.media?.[clip.src];
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
 * Normalize each layer to the clips shape first, then migrate each clip's
 * fields, so a field migration works whichever shape the file started in.
 */
async function migrateProject(
  project: SavedProject,
): Promise<MigrateProjectResult> {
  const changes: string[] = [];
  const layers: Layer[] = [];
  for (const savedLayer of project.layers) {
    const { name, muted, clips } = normalizeLayer(savedLayer, {
      layers,
      changes,
    });
    layers.push({
      name,
      ...(muted !== undefined && { muted }),
      clips: await Promise.all(
        clips.map((clip) =>
          migrateClip(clip, {
            label: `${clip.type} clip in layer "${name}"`,
            canvas: project.canvas,
            changes,
          }),
        ),
      ),
    });
  }
  const migrated: Project = {
    ...project,
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
  return { name, ...(muted !== undefined && { muted }), clips: [clip] };
}

async function migrateClip(
  clip: SavedClip,
  {
    label,
    canvas,
    changes,
  }: { label: string; canvas: Canvas; changes: string[] },
): Promise<Clip> {
  switch (clip.type) {
    case "color": {
      if (!clip.box) {
        changes.push(`${label} has no box`);
      }
      const { width, height } = canvas;
      return { ...clip, box: clip.box ?? { x: 0, y: 0, width, height } };
    }
    case "text": {
      let { height } = clip.box;
      if (height === undefined) {
        // The box followed the lines, which rendered at their natural height.
        changes.push(`${label} has no box height`);
        height = await measureTextHeight(clip);
      }
      return { ...clip, box: { ...clip.box, height } };
    }
    default: {
      return clip;
    }
  }
}

/** A saved layer's clips, whichever shape it was saved in. */
export function getSavedClips(layer: SavedLayer): SavedClip[] {
  return "clips" in layer ? layer.clips : [layer];
}
