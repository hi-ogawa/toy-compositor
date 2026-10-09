import { roundTo } from "../utils/math.ts";
import type { Box, Clip, Crop, Project, Size, Transform } from "./project.ts";

export type TimeRange = { start: number; end: number };

export function getOutputRange(project: Project): TimeRange {
  const { output, canvas } = project;
  return output.type === "video"
    ? output
    : { start: output.time, end: output.time + 1 / canvas.fps };
}

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

/**
 * The visible part of a crop on the canvas. The transform scales the whole size
 * and puts its top-left corner at its position, and the crop then hides edges
 * without moving the rest. Anything outside the canvas is clipped later.
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
  const cropped = getCroppedBox({ size, crop });
  return {
    width: Math.round(cropped.width * transform.scale),
    height: Math.round(cropped.height * transform.scale),
    x: Math.round(transform.x + cropped.x * transform.scale),
    y: Math.round(transform.y + cropped.y * transform.scale),
  };
}

/** Center the size on the canvas at the largest scale that keeps it inside. */
export function getFitTransform({
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

/**
 * Change the scale while the center of what the crop leaves stays where it is
 * on the canvas.
 */
export function getRescaledTransform({
  size,
  crop,
  transform,
  scale,
}: {
  size: Size;
  crop: Crop;
  transform: Transform;
  scale: number;
}): Transform {
  const cropped = getCroppedBox({ size, crop });
  const center = {
    x: cropped.x + cropped.width / 2,
    y: cropped.y + cropped.height / 2,
  };
  return {
    x: Math.round(transform.x + center.x * (transform.scale - scale)),
    y: Math.round(transform.y + center.y * (transform.scale - scale)),
    scale,
  };
}

/**
 * A handle's position on a box, as a fraction of its width and height, so a
 * corner is 0 or 1 on both axes and an edge's middle is ½ on the axis along it.
 */
export type BoxHandle = { x: 0 | 0.5 | 1; y: 0 | 0.5 | 1 };

/**
 * Scale from the transform at drag start so a corner handle follows the
 * pointer's travel while the opposite corner of the visible box stays fixed on
 * the canvas. A single scale cannot follow a one-axis drag, so a media clip has
 * no edge handles. The larger of the two axis ratios wins, so the dragged
 * corner reaches the pointer along whichever axis leads. The visible box keeps
 * at least 1px on each side, and the scale rounds as the inspector's scale
 * field does.
 */
export function getResizedTransform({
  size,
  crop,
  transform,
  handle,
  delta,
}: {
  size: Size;
  crop: Crop;
  transform: Transform;
  handle: BoxHandle;
  delta: { x: number; y: number };
}): Transform {
  const box = getVisibleBox({ size, crop, transform });
  const dragged = getDraggedSize({ box, handle, delta });
  const cropped = getCroppedBox({ size, crop });
  const ratio = Math.max(
    dragged.width / box.width,
    dragged.height / box.height,
  );
  const scale = roundTo(
    Math.max(
      transform.scale * ratio,
      1 / Math.min(cropped.width, cropped.height),
    ),
    1e-6,
  );
  // The visible box at the origin rounds its size and offset as it will be
  // placed, so deriving the position from them keeps the anchor pixel-exact.
  const placed = getVisibleBox({
    size,
    crop,
    transform: { x: 0, y: 0, scale },
  });
  const position = getAnchoredPosition({ box, handle, size: placed });
  return { x: position.x - placed.x, y: position.y - placed.y, scale };
}

/**
 * Resize the box at drag start so the handle follows the pointer's travel
 * while the opposite corner or edge stays fixed. Width and height change
 * freely, an edge handle leaves the other axis as it was, and the box keeps at
 * least 1px on each side. The size rounds to whole canvas pixels before the
 * position is derived from it, so the fixed side stays pixel-exact.
 */
export function getResizedBox({
  box,
  handle,
  delta,
}: {
  box: Box;
  handle: BoxHandle;
  delta: { x: number; y: number };
}): Box {
  const dragged = getDraggedSize({ box, handle, delta });
  const size = {
    width: Math.max(1, Math.round(dragged.width)),
    height: Math.max(1, Math.round(dragged.height)),
  };
  return { ...getAnchoredPosition({ box, handle, size }), ...size };
}

/** The box's size if the handle moved by the delta, with the opposite side fixed. */
function getDraggedSize({
  box,
  handle,
  delta,
}: {
  box: Box;
  handle: BoxHandle;
  delta: { x: number; y: number };
}): Size {
  return {
    width: box.width + (2 * handle.x - 1) * delta.x,
    height: box.height + (2 * handle.y - 1) * delta.y,
  };
}

/** Where a box of the new size goes so the side opposite the handle stays put. */
function getAnchoredPosition({
  box,
  handle,
  size,
}: {
  box: Box;
  handle: BoxHandle;
  size: Size;
}): { x: number; y: number } {
  return {
    x: box.x + (1 - handle.x) * (box.width - size.width),
    y: box.y + (1 - handle.y) * (box.height - size.height),
  };
}

/** What the crop leaves of the source, in source pixels. */
export function getCroppedBox({ size, crop }: { size: Size; crop: Crop }): Box {
  return {
    x: crop.left * size.width,
    y: crop.top * size.height,
    width: size.width * (1 - crop.left - crop.right),
    height: size.height * (1 - crop.top - crop.bottom),
  };
}
