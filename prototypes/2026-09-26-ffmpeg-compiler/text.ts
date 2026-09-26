// Render a text layer to a transparent PNG with ImageMagick.
// The PNG is box.width wide, so the compiler places it at box.x, box.y.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { TextLayer } from "./project.ts";

export function renderText({ layer, file }: { layer: TextLayer; file: string }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const gravity = { left: "west", center: "center", right: "east" }[layer.align ?? "left"];
  const common = [
    "-background",
    "none",
    "-size",
    `${layer.box.width}x`,
    "-gravity",
    gravity,
    "-font",
    magickFont(layer.font),
    "-pointsize",
    String(layer.font.size),
    "-interline-spacing",
    String(layer.font.lineSpacing ?? 0),
    "-fill",
    layer.color,
  ];
  // Draw the outline as a stroked copy underneath the plain text,
  // so the stroke only grows outward like Kdenlive's title outline.
  const outline = layer.outline
    ? ["(", ...common, "-stroke", layer.outline.color, "-strokewidth", String(layer.outline.width), `label:${layer.text}`, ")"]
    : [];
  execFileSync("magick", [
    ...outline,
    "(",
    ...common,
    "-stroke",
    "none",
    `label:${layer.text}`,
    ")",
    ...(layer.outline ? ["-gravity", "center", "-composite"] : []),
    file,
  ]);
}

// "Noto Sans CJK KR" at weight 700 -> "Noto-Sans-CJK-KR-Bold"
function magickFont(font: TextLayer["font"]) {
  const suffix: Record<number, string> = { 300: "-Light", 400: "", 500: "-Medium", 700: "-Bold", 900: "-Black" };
  return font.family.replaceAll(" ", "-") + (suffix[font.weight ?? 400] ?? "");
}
