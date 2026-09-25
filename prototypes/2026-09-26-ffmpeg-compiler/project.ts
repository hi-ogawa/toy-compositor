// Types for docs/project-format.md

export type Project = {
  canvas: { width: number; height: number; fps: number; background?: string };
  output: { type: "video"; start: number; end: number } | { type: "still"; time: number };
  layers: Layer[];
  markers?: Marker[];
};

export type Marker = { name: string; time: number };

export type Layer = VideoLayer | AudioLayer | ImageLayer | TextLayer | ColorLayer;

export type Box = { x: number; y: number; width: number; height: number };

export type Crop = { left?: number; right?: number; top?: number; bottom?: number };

export type VideoLayer = {
  type: "video";
  name?: string;
  src: string;
  start: number;
  in: number;
  out: number;
  box: Box;
  crop?: Crop;
};

export type AudioLayer = {
  type: "audio";
  name?: string;
  src: string;
  start: number;
  in: number;
  out: number;
  fadeIn?: number;
  fadeOut?: number;
  muted?: boolean;
};

export type ImageLayer = {
  type: "image";
  name?: string;
  src: string;
  box: Box;
  crop?: Crop;
  start?: number;
  end?: number;
};

export type TextLayer = {
  type: "text";
  name?: string;
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
  name?: string;
  color: string;
  opacity?: number;
  box?: Box;
  start?: number;
  end?: number;
};
