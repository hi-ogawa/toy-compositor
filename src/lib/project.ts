/** See docs/project-format.md */
export type Project = {
  canvas: { width: number; height: number; fps: number; background?: string };
  output:
    | { type: "video"; start: number; end: number }
    | { type: "still"; time: number };
  layers: Layer[];
  locators?: Locator[];
};

export type Locator = { label: string; time: number };

/** Canvas presets for new projects, named as their first project file. */
export const CANVAS_PRESETS = [
  { name: "horizontal-video", width: 1920, height: 1080 },
  { name: "vertical-video", width: 1080, height: 1920 },
] as const;

export type CanvasPreset = (typeof CANVAS_PRESETS)[number];

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
      background: "#000000",
    },
    output: { type: "video", start: 0, end: 10 },
    layers: [],
    locators: [],
  };
}

export type Layer =
  | VideoLayer
  | AudioLayer
  | ImageLayer
  | TextLayer
  | ColorLayer;

type LayerBase = { name?: string };

export type Box = { x: number; y: number; width: number; height: number };

export type Crop = {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
};

export type VideoLayer = LayerBase & {
  type: "video";
  src: string;
  start: number;
  in: number;
  out: number;
  box: Box;
  crop?: Crop;
  muted?: boolean;
  fadeIn?: number;
  fadeOut?: number;
};

export type AudioLayer = LayerBase & {
  type: "audio";
  src: string;
  start: number;
  in: number;
  out: number;
  fadeIn?: number;
  fadeOut?: number;
  muted?: boolean;
};

export type ImageLayer = LayerBase & {
  type: "image";
  src: string;
  box: Box;
  crop?: Crop;
  start: number;
  end: number;
};

export type TextLayer = LayerBase & {
  type: "text";
  text: string;
  box: { x: number; y: number; width: number };
  align?: "left" | "center" | "right";
  font: { family: string; size: number; weight?: number; lineSpacing?: number };
  color: string;
  outline?: { width: number; color: string };
  start: number;
  end: number;
};

export type ColorLayer = LayerBase & {
  type: "color";
  color: string;
  opacity?: number;
  box?: Box;
  start: number;
  end: number;
};
