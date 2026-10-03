import type { Box, Crop, Layer, Project } from "./project.ts";

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
  if (layer.type !== "video") {
    return range;
  }
  return {
    start: range.start - layer.hold.before,
    end: range.end + layer.hold.after,
  };
}

export function intersect(a: TimeRange, b: TimeRange): TimeRange | undefined {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : undefined;
}

/** Scale the cropped source to fit inside the box, keeping its aspect ratio, centered. */
export function fitBox({
  source,
  crop,
  box,
}: {
  source: { width: number; height: number };
  crop: Crop;
  box: Box;
}) {
  const cw = source.width * (1 - crop.left - crop.right);
  const ch = source.height * (1 - crop.top - crop.bottom);
  const scale = Math.min(box.width / cw, box.height / ch);
  const width = roundToEven(cw * scale);
  const height = roundToEven(ch * scale);
  return {
    width,
    height,
    x: Math.round(box.x + (box.width - width) / 2),
    y: Math.round(box.y + (box.height - height) / 2),
  };
}

function roundToEven(n: number) {
  return Math.max(2, 2 * Math.round(n / 2));
}
