import { createNumberedName } from "../utils/name.ts";
import { fitBox, type TimeRange } from "./layout.ts";
import type { MediaType } from "./media-file.ts";
import type {
  Canvas,
  ColorLayer,
  Layer,
  MediaInfo,
  TextLayer,
} from "./project.ts";

/** Numbers a layer by its type among the existing ones, such as `Text 2`. */
export function createLayerName({
  layers,
  type,
}: {
  layers: readonly Pick<Layer, "name" | "type">[];
  type: Layer["type"];
}): string {
  return createNumberedName({
    names: layers
      .filter((layer) => layer.type === type)
      .map((layer) => layer.name),
    prefix: type[0]!.toUpperCase() + type.slice(1),
  });
}

/** Video and images fit inside the canvas, so the box is the visible area. */
export function createMediaLayer({
  src,
  type,
  mediaInfo,
  canvas,
  start,
  stillRange,
}: {
  src: string;
  type: MediaType;
  mediaInfo: MediaInfo;
  canvas: Canvas;
  start: number;
  stillRange: TimeRange;
}): Layer {
  const name = src
    .split("/")
    .pop()!
    .replace(/\.[^.]+$/, "");
  const canvasBox = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const crop = { left: 0, right: 0, top: 0, bottom: 0 };
  switch (type) {
    case "video": {
      return {
        name,
        type,
        src,
        start,
        in: mediaInfo.start,
        out: mediaInfo.end,
        box: fitBox({ source: mediaInfo.video!, crop, box: canvasBox }),
        crop,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        hold: { before: 0, after: 0 },
      };
    }
    case "audio": {
      return {
        name,
        type,
        src,
        start,
        in: mediaInfo.start,
        out: mediaInfo.end,
        fadeIn: 0,
        fadeOut: 0,
        muted: false,
      };
    }
    case "image": {
      return {
        name,
        type,
        src,
        box: fitBox({ source: mediaInfo.video!, crop, box: canvasBox }),
        crop,
        ...stillRange,
      };
    }
  }
}

export function createTextLayer({
  name,
  canvas,
  range,
}: {
  name: string;
  canvas: Canvas;
  range: TimeRange;
}): TextLayer {
  return {
    name,
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
      weight: 400,
      lineSpacing: 0,
    },
    color: "#ffffff",
    ...range,
  };
}

export function createColorLayer({
  name,
  canvas,
  range,
}: {
  name: string;
  canvas: Canvas;
  range: TimeRange;
}): ColorLayer {
  return {
    name,
    type: "color",
    color: "#000000",
    opacity: 0.5,
    box: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    ...range,
  };
}
