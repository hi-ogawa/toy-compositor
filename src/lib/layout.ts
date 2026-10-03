import type { Box, Crop, Layer, Project, Transform } from "./project.ts";

export type TimeRange = { start: number; end: number };

export function getOutputRange(project: Project): TimeRange {
  const { output, canvas } = project;
  return output.type === "video"
    ? output
    : { start: output.time, end: output.time + 1 / canvas.fps };
}

/** Timeline span covering every layer, from the earliest start to the latest end. */
export function getContentRange(project: Project): TimeRange {
  if (project.layers.length === 0) {
    return { start: 0, end: 0 };
  }
  const ranges = project.layers.map(getLayerRange);
  return {
    start: Math.min(...ranges.map((range) => range.start)),
    end: Math.max(...ranges.map((range) => range.end)),
  };
}

/** Timeline span of a layer, from its source range for video and audio. */
export function getLayerRange(layer: Layer): TimeRange {
  if (layer.type === "video" || layer.type === "audio") {
    return { start: layer.start, end: layer.start + layer.out - layer.in };
  }
  return { start: layer.start, end: layer.end };
}

/** Timeline span of a layer's picture, extended by a video layer's hold. */
export function getPictureRange(layer: Layer): TimeRange {
  const range = getLayerRange(layer);
  if (layer.type !== "video" || !layer.hold) {
    return range;
  }
  return {
    start: range.start - (layer.hold.before ?? 0),
    end: range.end + (layer.hold.after ?? 0),
  };
}

export function intersect(a: TimeRange, b: TimeRange): TimeRange | undefined {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : undefined;
}

type Size = { width: number; height: number };

/**
 * Place the visible part of the source on the canvas. The transform scales the
 * whole source and puts its top-left corner at its position, and the crop then
 * hides edges without moving the rest. The size rounds to even pixels for the
 * encoder's chroma subsampling, and anything outside the canvas is clipped later.
 */
export function placeMedia({
  source,
  crop = {},
  transform,
}: {
  source: Size;
  crop?: Crop;
  transform: Transform;
}): Box {
  const cropped = getCroppedSize({ source, crop });
  return {
    width: roundToEven(cropped.width * transform.scale),
    height: roundToEven(cropped.height * transform.scale),
    x: Math.round(
      transform.x + (crop.left ?? 0) * source.width * transform.scale,
    ),
    y: Math.round(
      transform.y + (crop.top ?? 0) * source.height * transform.scale,
    ),
  };
}

/** Center the source on the canvas at the largest scale that keeps it inside. */
export function fitCanvas({
  source,
  canvas,
}: {
  source: Size;
  canvas: Size;
}): Transform {
  const scale = Math.min(
    canvas.width / source.width,
    canvas.height / source.height,
  );
  return {
    x: Math.round((canvas.width - source.width * scale) / 2),
    y: Math.round((canvas.height - source.height * scale) / 2),
    scale,
  };
}

/** Change the scale around the center of the scaled source, so it stays in place. */
export function rescaleMedia({
  source,
  transform,
  scale,
}: {
  source: Size;
  transform: Transform;
  scale: number;
}): Transform {
  return {
    x: Math.round(transform.x + (source.width * (transform.scale - scale)) / 2),
    y: Math.round(
      transform.y + (source.height * (transform.scale - scale)) / 2,
    ),
    scale,
  };
}

/** The source's size in its own pixels after removing each cropped edge. */
export function getCroppedSize({
  source,
  crop = {},
}: {
  source: Size;
  crop?: Crop;
}): Size {
  return {
    width: source.width * (1 - (crop.left ?? 0) - (crop.right ?? 0)),
    height: source.height * (1 - (crop.top ?? 0) - (crop.bottom ?? 0)),
  };
}

export function roundToEven(n: number) {
  return Math.max(2, 2 * Math.round(n / 2));
}
