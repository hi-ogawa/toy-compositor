import { createNumberedName } from "../utils/name.ts";
import { getFitTransform, type TimeRange } from "./layout.ts";
import type { MediaType } from "./media-file.ts";
import {
  NEUTRAL_VALUES,
  type Canvas,
  type Clip,
  type ColorClip,
  type Layer,
  type MediaInfo,
  type TextClip,
} from "./project.ts";
import { snapToFrame } from "./timeline.ts";

/** Seconds a new text, color, or image clip lasts. */
const STILL_LENGTH = 5;

/** Numbers a layer by a clip type among the layers holding it, such as `Text 2`. */
export function createLayerName({
  layers,
  type,
}: {
  layers: readonly Layer[];
  type: Clip["type"];
}): string {
  return createNumberedName({
    names: layers
      .filter((layer) => layer.clips.some((clip) => clip.type === type))
      .map((layer) => layer.name),
    prefix: type[0]!.toUpperCase() + type.slice(1),
  });
}

/** A new layer holds no clips, and is numbered among every layer, such as `Layer 2`. */
export function createEmptyLayer({
  layers,
}: {
  layers: readonly Layer[];
}): Layer {
  return {
    name: createNumberedName({
      names: layers.map((layer) => layer.name),
      prefix: "Layer",
    }),
    ...NEUTRAL_VALUES.layer,
    clips: [],
  };
}

/** Video and images start fitted inside the canvas, centered. */
export function createMediaClip({
  src,
  type,
  mediaInfo,
  canvas,
  start,
}: {
  src: string;
  type: MediaType;
  mediaInfo: MediaInfo;
  canvas: Canvas;
  start: number;
}): Clip {
  switch (type) {
    case "video": {
      return {
        type,
        src,
        start,
        in: mediaInfo.start,
        out: mediaInfo.end,
        transform: getFitTransform({ size: mediaInfo.video!, canvas }),
        ...NEUTRAL_VALUES.video,
      };
    }
    case "audio": {
      return {
        type,
        src,
        start,
        in: mediaInfo.start,
        out: mediaInfo.end,
        ...NEUTRAL_VALUES.audio,
      };
    }
    case "image": {
      return {
        type,
        src,
        transform: getFitTransform({ size: mediaInfo.video!, canvas }),
        ...NEUTRAL_VALUES.image,
        ...getStillRange({ start, canvas }),
      };
    }
  }
}

export function createTextClip({
  canvas,
  start,
}: {
  canvas: Canvas;
  start: number;
}): TextClip {
  return {
    type: "text",
    text: "Text",
    box: {
      x: Math.round(canvas.width * 0.1),
      y: Math.round(canvas.height * 0.4),
      width: Math.round(canvas.width * 0.8),
      // Leaves room for one line at the default size.
      height: Math.round(canvas.height * 0.2),
    },
    align: "center",
    font: {
      family: "Noto Sans",
      size: Math.round(canvas.height / 10),
      ...NEUTRAL_VALUES.text.font,
    },
    color: "#ffffff",
    ...getStillRange({ start, canvas }),
  };
}

export function createColorClip({
  canvas,
  start,
}: {
  canvas: Canvas;
  start: number;
}): ColorClip {
  return {
    type: "color",
    color: "#000000",
    opacity: 0.5,
    box: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    ...getStillRange({ start, canvas }),
  };
}

/** A still has no source length, so it lasts a fixed length from its start. */
function getStillRange({
  start,
  canvas,
}: {
  start: number;
  canvas: Canvas;
}): TimeRange {
  return { start, end: snapToFrame(start + STILL_LENGTH, canvas.fps) };
}
