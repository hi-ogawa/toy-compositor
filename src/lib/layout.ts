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

/** What the crop leaves of the source, in source pixels. */
export function getCroppedBox({ size, crop }: { size: Size; crop: Crop }): Box {
  return {
    x: crop.left * size.width,
    y: crop.top * size.height,
    width: size.width * (1 - crop.left - crop.right),
    height: size.height * (1 - crop.top - crop.bottom),
  };
}
