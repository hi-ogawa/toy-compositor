import { fitBox, type Range } from "./layout.ts";
import type { MediaInfo } from "./media.ts";
import type { ColorLayer, Layer, Project, TextLayer } from "./project.ts";

type Canvas = Project["canvas"];

/**
 * A layer for a media file, named after the file. A video or audio layer plays
 * its whole source from `start`, and an image spans `stillRange`. Video and
 * images fit inside the canvas at their own aspect ratio, so the box is the
 * visible area.
 */
export function createMediaLayer({
  src,
  info,
  canvas,
  start,
  stillRange,
}: {
  src: string;
  info: MediaInfo;
  canvas: Canvas;
  start: number;
  stillRange: Range;
}): Layer {
  const name = src
    .split("/")
    .pop()!
    .replace(/\.[^.]+$/, "");
  const canvasBox = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  switch (info.type) {
    case "video": {
      return {
        name,
        type: "video",
        src,
        start,
        in: info.start,
        out: info.end,
        box: fitBox({ source: info, box: canvasBox }),
      };
    }
    case "audio": {
      return { name, type: "audio", src, start, in: info.start, out: info.end };
    }
    case "image": {
      return {
        name,
        type: "image",
        src,
        box: fitBox({ source: info, box: canvasBox }),
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
  range: Range;
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
export function createColorLayer({ range }: { range: Range }): ColorLayer {
  return { type: "color", color: "#000000", opacity: 0.5, ...range };
}
