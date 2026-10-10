import type { Box, Clip, Crop, Project, Size, Transform } from "./project.ts";
import { roundToMillisecond } from "./timeline.ts";

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

/**
 * A layer's clips are in order by `start`, and each clip's picture range ends
 * at or before the next one's begins, so a hold only fills a gap. Ends are
 * compared to the millisecond that project times are rounded to, because a
 * computed end such as `start + out - in` can land a hair past it. Returns the
 * index of the first clip that breaks this against the clip before it.
 */
export function findMisplacedClip(clips: readonly Clip[]): number | undefined {
  for (let index = 1; index < clips.length; index++) {
    const previous = clips[index - 1]!;
    const clip = clips[index]!;
    if (
      clip.start < previous.start ||
      roundToMillisecond(getPictureRange(clip).start) <
        roundToMillisecond(getPictureRange(previous).end)
    ) {
      return index;
    }
  }
  return undefined;
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

export type Alignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";

/**
 * How far to move a box so it touches a canvas edge or sits at the canvas
 * center along one axis, leaving the other axis where it is.
 */
export function getAlignOffset({
  box,
  canvas,
  alignment,
}: {
  box: Box;
  canvas: Size;
  alignment: Alignment;
}): { x: number; y: number } {
  switch (alignment) {
    case "left": {
      return { x: -box.x, y: 0 };
    }
    case "center": {
      return { x: Math.round((canvas.width - box.width) / 2) - box.x, y: 0 };
    }
    case "right": {
      return { x: canvas.width - box.width - box.x, y: 0 };
    }
    case "top": {
      return { x: 0, y: -box.y };
    }
    case "middle": {
      return { x: 0, y: Math.round((canvas.height - box.height) / 2) - box.y };
    }
    case "bottom": {
      return { x: 0, y: canvas.height - box.height - box.y };
    }
  }
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
 * Scale uniformly so what the crop leaves spans the canvas along one
 * dimension, against its edge there, and keep its center along the other.
 */
export function getFilledTransform({
  size,
  crop,
  transform,
  canvas,
  dimension,
}: {
  size: Size;
  crop: Crop;
  transform: Transform;
  canvas: Size;
  dimension: "width" | "height";
}): Transform {
  const cropped = getCroppedBox({ size, crop });
  const rescaled = getRescaledTransform({
    size,
    crop,
    transform,
    scale: canvas[dimension] / cropped[dimension],
  });
  const offset = getAlignOffset({
    box: getVisibleBox({ size, crop, transform: rescaled }),
    canvas,
    alignment: dimension === "width" ? "left" : "top",
  });
  return { ...rescaled, x: rescaled.x + offset.x, y: rescaled.y + offset.y };
}

/** Stretch the box across the canvas along one dimension, keeping the other. */
export function getFilledBox({
  box,
  canvas,
  dimension,
}: {
  box: Box;
  canvas: Size;
  dimension: "width" | "height";
}): Box {
  return dimension === "width"
    ? { ...box, x: 0, width: canvas.width }
    : { ...box, y: 0, height: canvas.height };
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
