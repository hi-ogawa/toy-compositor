import type { TextClip } from "./project.ts";

let context: CanvasRenderingContext2D | undefined;

/**
 * The font's ascent and descent in pixels, from its own metrics rather than any
 * glyph's, which are what ImageMagick's label: spaces lines by in the render.
 */
export function measureFontMetrics(font: TextClip["font"]) {
  context ??= document.createElement("canvas").getContext("2d")!;
  context.font = `${font.weight} ${font.size}px "${font.family}"`;
  const metrics = context.measureText("");
  return {
    ascent: metrics.fontBoundingBoxAscent,
    descent: metrics.fontBoundingBoxDescent,
  };
}
