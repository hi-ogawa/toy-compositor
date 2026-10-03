import type { Box, Clip, Crop, Project } from "./project.ts";

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
  if (clip.type !== "video" || !clip.hold) {
    return range;
  }
  return {
    start: range.start - (clip.hold.before ?? 0),
    end: range.end + (clip.hold.after ?? 0),
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
  crop = {},
  box,
}: {
  source: { width: number; height: number };
  crop?: Crop;
  box: Box;
}) {
  const cw = source.width * (1 - (crop.left ?? 0) - (crop.right ?? 0));
  const ch = source.height * (1 - (crop.top ?? 0) - (crop.bottom ?? 0));
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
