// Types for docs/project-format.md

export type Project = {
  canvas: { width: number; height: number; fps: number; background?: string };
  output:
    | { type: "video"; start: number; end: number }
    | { type: "still"; time: number };
  layers: Layer[];
};

export type Layer =
  | VideoLayer
  | AudioLayer
  | ImageLayer
  | TextLayer
  | ColorLayer;

export type Box = { x: number; y: number; width: number; height: number };

export type Crop = {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
};

export type VideoLayer = {
  type: "video";
  src: string;
  start: number;
  in: number;
  out: number;
  box: Box;
  crop?: Crop;
};

export type AudioLayer = {
  type: "audio";
  src: string;
  start: number;
  in: number;
  out: number;
  fadeIn?: number;
  fadeOut?: number;
};

export type ImageLayer = {
  type: "image";
  src: string;
  box: Box;
  crop?: Crop;
  start?: number;
  end?: number;
};

export type TextLayer = {
  type: "text";
  text: string;
  box: { x: number; y: number; width: number };
  align?: "left" | "center" | "right";
  font: { family: string; size: number; weight?: number; lineSpacing?: number };
  color: string;
  outline?: { width: number; color: string };
  start?: number;
  end?: number;
};

export type ColorLayer = {
  type: "color";
  color: string;
  opacity?: number;
  box?: Box;
  start?: number;
  end?: number;
};
