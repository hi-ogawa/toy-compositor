// Pure layout and timing math shared by the compiler and the editor.

import type { Box, Crop, Project } from "./project.ts";

export type Range = { start: number; end: number };

export function outputRange(project: Project): Range {
  const { output, canvas } = project;
  return output.type === "video"
    ? output
    : { start: output.time, end: output.time + 1 / canvas.fps };
}

export function intersect(a: Range, b: Range): Range | undefined {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : undefined;
}

// Scale the cropped source to fit inside the box, keeping its aspect ratio, centered.
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
  const width = even(cw * scale);
  const height = even(ch * scale);
  return {
    width,
    height,
    x: Math.round(box.x + (box.width - width) / 2),
    y: Math.round(box.y + (box.height - height) / 2),
  };
}

function even(n: number) {
  return Math.max(2, 2 * Math.round(n / 2));
}
