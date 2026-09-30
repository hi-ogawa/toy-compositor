import { fitBox, type TimeRange } from "./layout.ts";
import type { MediaType } from "./media-file.ts";
import type {
  Canvas,
  ColorLayer,
  Layer,
  MediaInfo,
  TextLayer,
} from "./project.ts";

/**
 * A layer for a media file, named after the file. A video or audio layer plays
 * its whole source range from `start`, and an image spans `stillRange`. Video
 * and images fit inside the canvas at their own aspect ratio, so the box is the
 * visible area.
 */
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
  switch (type) {
    case "video": {
      return {
        name,
        type,
        src,
        start,
        in: mediaInfo.start,
        out: mediaInfo.end,
        box: fitBox({ source: mediaInfo.video!, box: canvasBox }),
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
        box: fitBox({ source: mediaInfo.video!, box: canvasBox }),
        ...stillRange,
      };
    }
  }
}

/** A white centered caption across the middle of the canvas. */
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
    },
    align: "center",
    font: { family: "Noto Sans", size: Math.round(canvas.height / 10) },
    color: "#ffffff",
    ...range,
  };
}

/** A half-transparent black fill over the whole canvas, like a dim under a title. */
export function createColorLayer({ range }: { range: TimeRange }): ColorLayer {
  return { type: "color", color: "#000000", opacity: 0.5, ...range };
}
