import { createNumberedName } from "../utils/name.ts";
import { fitBox, type TimeRange } from "./layout.ts";
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

/** A media file's layer is named after the file, and holds one clip of it. */
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
  return {
    name,
    ...NEUTRAL_VALUES.layer,
    clips: [
      createMediaClip({ src, type, mediaInfo, canvas, start, stillRange }),
    ],
  };
}

/** Video and images fit inside the canvas, so the box is the visible area. */
function createMediaClip({
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
}): Clip {
  const canvasBox = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  switch (type) {
    case "video": {
      return {
        type,
        src,
        start,
        in: mediaInfo.start,
        out: mediaInfo.end,
        box: fitBox({
          source: mediaInfo.video!,
          crop: NEUTRAL_VALUES.video.crop,
          box: canvasBox,
        }),
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
        box: fitBox({
          source: mediaInfo.video!,
          crop: NEUTRAL_VALUES.image.crop,
          box: canvasBox,
        }),
        ...NEUTRAL_VALUES.image,
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
}): Layer {
  return {
    name,
    ...NEUTRAL_VALUES.layer,
    clips: [createTextClip({ canvas, range })],
  };
}

function createTextClip({
  canvas,
  range,
}: {
  canvas: Canvas;
  range: TimeRange;
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
}): Layer {
  return {
    name,
    ...NEUTRAL_VALUES.layer,
    clips: [createColorClip({ canvas, range })],
  };
}

function createColorClip({
  canvas,
  range,
}: {
  canvas: Canvas;
  range: TimeRange;
}): ColorClip {
  return {
    type: "color",
    color: "#000000",
    opacity: 0.5,
    box: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    ...range,
  };
}
