import fs from "node:fs";
import path from "node:path";
import { execFileAsync } from "../../utils/exec.ts";
import type { TextLayer } from "../project.ts";

/** The fields that decide how a text layer's lines are drawn, without its box. */
type TextDrawing = Pick<
  TextLayer,
  "text" | "align" | "font" | "color" | "outline"
>;

/**
 * Render a text layer to a transparent PNG with ImageMagick.
 * The PNG is the box's size, so the compiler places it at box.x, box.y.
 */
export async function renderText({
  layer,
  file,
}: {
  layer: TextLayer;
  file: string;
}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await execFileAsync("magick", [
    ...getDrawArgs(layer),
    // label: scales the text to fill a -size width and ignores -pointsize, so the text
    // is drawn at its natural size and then extended to the box width by alignment.
    "-gravity",
    getGravity(layer),
    "-extent",
    `${layer.box.width}x%[h]`,
    // Lines start at the top of the box, and lines past its bottom are cut off.
    "-gravity",
    "north",
    "-extent",
    `${layer.box.width}x${layer.box.height}`,
    file,
  ]);
}

/** Measure the height of a text layer's lines as renderText draws them. */
export async function measureTextHeight(layer: TextDrawing): Promise<number> {
  const { stdout } = await execFileAsync("magick", [
    ...getDrawArgs(layer),
    "-format",
    "%h",
    "info:",
  ]);
  return Number(stdout);
}

/** Draw the lines at their natural size, before they are placed in the box. */
function getDrawArgs(layer: TextDrawing): string[] {
  const common = [
    "-background",
    "none",
    "-gravity",
    getGravity(layer),
    "-font",
    getMagickFont(layer.font),
    "-pointsize",
    String(layer.font.size),
    "-interline-spacing",
    String(layer.font.lineSpacing),
    "-fill",
    layer.color,
  ];
  // Draw the outline as a stroked copy underneath the plain text,
  // so the stroke only grows outward like Kdenlive's title outline.
  const outline = layer.outline
    ? [
        "(",
        ...common,
        "-stroke",
        layer.outline.color,
        "-strokewidth",
        String(layer.outline.width),
        `label:${layer.text}`,
        ")",
      ]
    : [];
  return [
    ...outline,
    "(",
    ...common,
    "-stroke",
    "none",
    `label:${layer.text}`,
    ")",
    ...(layer.outline ? ["-gravity", "center", "-composite"] : []),
  ];
}

function getGravity(layer: TextDrawing) {
  return { left: "west", center: "center", right: "east" }[layer.align];
}

/** "Noto Sans CJK KR" at weight 700 -> "Noto-Sans-CJK-KR-Bold" */
function getMagickFont(font: TextLayer["font"]) {
  const suffix: Record<number, string> = {
    300: "-Light",
    400: "",
    500: "-Medium",
    700: "-Bold",
    900: "-Black",
  };
  return font.family.replaceAll(" ", "-") + (suffix[font.weight] ?? "");
}
