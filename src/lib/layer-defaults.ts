import { fitInsideCanvas, type TimeRange } from "./layout.ts";
import type { MediaType } from "./media-file.ts";
import type {
  Canvas,
  ColorLayer,
  Layer,
  MediaInfo,
  TextLayer,
} from "./project.ts";

/** Video and images start fitted inside the canvas, centered. */
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
  switch (type) {
    case "video": {
      return {
        name,
        type,
        src,
        start,
        in: mediaInfo.start,
        out: mediaInfo.end,
        transform: fitInsideCanvas({ size: mediaInfo.video!, canvas }),
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
      };
    }
    case "image": {
      return {
        name,
        type,
        src,
        transform: fitInsideCanvas({ size: mediaInfo.video!, canvas }),
        ...stillRange,
      };
    }
  }
}

export function createTextLayer({
  canvas,
  range,
}: {
  canvas: Canvas;
  range: TimeRange;
}): TextLayer {
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
    font: { family: "Noto Sans", size: Math.round(canvas.height / 10) },
    color: "#ffffff",
    ...range,
  };
}

export function createColorLayer({
  canvas,
  range,
}: {
  canvas: Canvas;
  range: TimeRange;
}): ColorLayer {
  return {
    type: "color",
    color: "#000000",
    opacity: 0.5,
    box: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    ...range,
  };
}
