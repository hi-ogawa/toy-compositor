/** See docs/project-format.md */
export type Project = {
  canvas: Canvas;
  output: Output;
  layers: Layer[];
  locators: Locator[];
  /** Facts about every media file a clip uses, keyed by the clips' `src`. */
  media: Record<string, MediaInfo>;
};

/** A width and height in pixels, such as the canvas's or a media file's picture. */
export type Size = { width: number; height: number };

export type Canvas = Size & {
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
export type VideoInfo = Size & {
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
 * New layers and clips start from them, and migration fills them into older
 * projects.
 */
export const NEUTRAL_VALUES = {
  canvas: { background: "#000000" },
  layer: { muted: false, hidden: false },
  video: {
    crop: { left: 0, right: 0, top: 0, bottom: 0 },
    fadeIn: 0,
    fadeOut: 0,
    hold: { before: 0, after: 0 },
  },
  audio: { fadeIn: 0, fadeOut: 0 },
  image: { crop: { left: 0, right: 0, top: 0, bottom: 0 } },
  text: { align: "left", font: { weight: 400, lineSpacing: 0 } },
  color: { opacity: 1 },
} satisfies {
  canvas: Pick<Canvas, "background">;
  layer: Pick<Layer, "muted" | "hidden">;
  video: Pick<VideoClip, "crop" | "fadeIn" | "fadeOut" | "hold">;
  audio: Pick<AudioClip, "fadeIn" | "fadeOut">;
  image: Pick<ImageClip, "crop">;
  text: Pick<TextClip, "align"> & {
    font: Pick<TextClip["font"], "weight" | "lineSpacing">;
  };
  color: Pick<ColorClip, "opacity">;
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

/**
 * A lane in the stack, like a track in a video editor, holding clips. The
 * editor only creates layers with one clip so far.
 */
export type Layer = {
  name: string;
  muted: boolean;
  hidden: boolean;
  clips: Clip[];
};

export type Clip = VideoClip | AudioClip | ImageClip | TextClip | ColorClip;

export type Box = { x: number; y: number; width: number; height: number };

/** Where a media clip's whole source goes: its top-left corner in canvas pixels, at a uniform scale. */
export type Transform = { x: number; y: number; scale: number };

export type Crop = { left: number; right: number; top: number; bottom: number };

export type VideoClip = {
  type: "video";
  src: string;
  start: number;
  in: number;
  out: number;
  transform: Transform;
  crop: Crop;
  fadeIn: number;
  fadeOut: number;
  hold: { before: number; after: number };
};

export type AudioClip = {
  type: "audio";
  src: string;
  start: number;
  in: number;
  out: number;
  fadeIn: number;
  fadeOut: number;
};

export type ImageClip = {
  type: "image";
  src: string;
  transform: Transform;
  crop: Crop;
  start: number;
  end: number;
};

export type TextClip = {
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

export type ColorClip = {
  type: "color";
  color: string;
  opacity: number;
  box: Box;
  start: number;
  end: number;
};
