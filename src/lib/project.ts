/** See docs/project-format.md */
export type Project = {
  canvas: Canvas;
  output: Output;
  layers: Layer[];
  locators: Locator[];
  /** Facts about every media file a layer uses, keyed by the layers' `src`. */
  media: Record<string, MediaInfo>;
};

export type Canvas = {
  width: number;
  height: number;
  fps: number;
  background: string;
};

export type Output =
  | { type: "video"; start: number; end: number }
  | { type: "still"; time: number };

export type Locator = { label: string; time: number };

/** What ffprobe reports about a media file, which depends only on its contents. */
export type MediaInfo = {
  /**
   * The file's source time range, in the presentation timestamps that `in` and
   * `out` use, so it includes the container's start offset. A still image has
   * no duration, so both are 0.
   */
  start: number;
  end: number;
  video?: VideoInfo;
  audio: boolean;
};

/** A media file's video stream, which images have too. */
export type VideoInfo = {
  width: number;
  height: number;
  /** The video stream's own start time, which frame timing counts from. */
  startTime: number;
  frameRate: number;
};

/** Canvas presets for new projects, named as their first project file. */
export const CANVAS_PRESETS = [
  { name: "horizontal-video", width: 1920, height: 1080 },
  { name: "vertical-video", width: 1080, height: 1920 },
] as const;

export type CanvasPreset = (typeof CANVAS_PRESETS)[number];

/**
 * Values that leave their property without effect, such as no crop or no fade.
 * New layers start from them, and migration fills them into older projects.
 */
export const NEUTRAL_VALUES = {
  canvas: { background: "#000000" },
  video: {
    crop: { left: 0, right: 0, top: 0, bottom: 0 },
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    hold: { before: 0, after: 0 },
  },
  audio: { muted: false, fadeIn: 0, fadeOut: 0 },
  image: { crop: { left: 0, right: 0, top: 0, bottom: 0 } },
  text: { align: "left", font: { weight: 400, lineSpacing: 0 } },
  color: { opacity: 1 },
} satisfies {
  canvas: Pick<Canvas, "background">;
  video: Pick<VideoLayer, "crop" | "muted" | "fadeIn" | "fadeOut" | "hold">;
  audio: Pick<AudioLayer, "muted" | "fadeIn" | "fadeOut">;
  image: Pick<ImageLayer, "crop">;
  text: Pick<TextLayer, "align"> & {
    font: Pick<TextLayer["font"], "weight" | "lineSpacing">;
  };
  color: Pick<ColorLayer, "opacity">;
};

/**
 * Create a project without layers. Its output starts as a short range from 0,
 * because no media exists yet to size it by.
 */
export function createEmptyProject(preset: CanvasPreset): Project {
  return {
    canvas: {
      width: preset.width,
      height: preset.height,
      fps: 30,
      ...NEUTRAL_VALUES.canvas,
    },
    output: { type: "video", start: 0, end: 10 },
    layers: [],
    locators: [],
    media: {},
  };
}

export type Layer =
  | VideoLayer
  | AudioLayer
  | ImageLayer
  | TextLayer
  | ColorLayer;

type LayerBase = { name: string };

export type Box = { x: number; y: number; width: number; height: number };

export type Crop = { left: number; right: number; top: number; bottom: number };

export type VideoLayer = LayerBase & {
  type: "video";
  src: string;
  start: number;
  in: number;
  out: number;
  box: Box;
  crop: Crop;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  hold: { before: number; after: number };
};

export type AudioLayer = LayerBase & {
  type: "audio";
  src: string;
  start: number;
  in: number;
  out: number;
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
};

export type ImageLayer = LayerBase & {
  type: "image";
  src: string;
  box: Box;
  crop: Crop;
  start: number;
  end: number;
};

export type TextLayer = LayerBase & {
  type: "text";
  text: string;
  box: Box;
  align: "left" | "center" | "right";
  font: { family: string; size: number; weight: number; lineSpacing: number };
  color: string;
  outline?: { width: number; color: string };
  start: number;
  end: number;
};

export type ColorLayer = LayerBase & {
  type: "color";
  color: string;
  opacity: number;
  box: Box;
  start: number;
  end: number;
};
