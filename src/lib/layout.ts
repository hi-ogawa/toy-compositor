import type { Box, Clip, Crop, Project, Transform } from "./project.ts";

export type TimeRange = { start: number; end: number };

export function getOutputRange(project: Project): TimeRange {
  const { output, canvas } = project;
  return output.type === "video"
    ? output
    : { start: output.time, end: output.time + 1 / canvas.fps };
}

/** Timeline span covering every clip, from the earliest start to the latest end. */
export function getContentRange(project: Project): TimeRange {
  const ranges = project.layers.flatMap((layer) =>
    layer.clips.map(getClipRange),
  );
  if (ranges.length === 0) {
    return { start: 0, end: 0 };
  }
  return {
    start: Math.min(...ranges.map((range) => range.start)),
    end: Math.max(...ranges.map((range) => range.end)),
  };
}

/** Timeline span of a clip, from its source range for video and audio. */
export function getClipRange(clip: Clip): TimeRange {
  if (clip.type === "video" || clip.type === "audio") {
    return { start: clip.start, end: clip.start + clip.out - clip.in };
  }
  return { start: clip.start, end: clip.end };
}

/** Timeline span of a clip's picture, extended by a video clip's hold. */
export function getPictureRange(clip: Clip): TimeRange {
  const range = getClipRange(clip);
  if (clip.type !== "video") {
    return range;
  }
  return {
    start: range.start - clip.hold.before,
    end: range.end + clip.hold.after,
  };
}

export function intersect(a: TimeRange, b: TimeRange): TimeRange | undefined {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : undefined;
}

type Size = { width: number; height: number };

/**
 * The visible part of a crop on the canvas. The transform scales the whole size
 * and puts its top-left corner at its position, and the crop then hides edges
 * without moving the rest. The size rounds to even pixels for the encoder's
 * chroma subsampling, and anything outside the canvas is clipped later.
 */
export function getVisibleBox({
  size,
  crop,
  transform,
}: {
  size: Size;
  crop: Crop;
  transform: Transform;
}): Box {
  const cropped = getCroppedSize({ size, crop });
  return {
    width: roundToEven(cropped.width * transform.scale),
    height: roundToEven(cropped.height * transform.scale),
    x: Math.round(transform.x + crop.left * size.width * transform.scale),
    y: Math.round(transform.y + crop.top * size.height * transform.scale),
  };
}

/** Center the size on the canvas at the largest scale that keeps it inside. */
export function getFittedTransform({
  size,
  canvas,
}: {
  size: Size;
  canvas: Size;
}): Transform {
  const scale = Math.min(
    canvas.width / size.width,
    canvas.height / size.height,
  );
  return {
    x: Math.round((canvas.width - size.width * scale) / 2),
    y: Math.round((canvas.height - size.height * scale) / 2),
    scale,
  };
}

/** Change the scale around the center of the scaled size, so it stays in place. */
export function scaleTransform({
  size,
  transform,
  scale,
}: {
  size: Size;
  transform: Transform;
  scale: number;
}): Transform {
  return {
    x: Math.round(transform.x + (size.width * (transform.scale - scale)) / 2),
    y: Math.round(transform.y + (size.height * (transform.scale - scale)) / 2),
    scale,
  };
}

/** The size after removing each cropped edge. */
export function getCroppedSize({
  size,
  crop,
}: {
  size: Size;
  crop: Crop;
}): Size {
  return {
    width: size.width * (1 - crop.left - crop.right),
    height: size.height * (1 - crop.top - crop.bottom),
  };
}

export function roundToEven(n: number) {
  return Math.max(2, 2 * Math.round(n / 2));
}
