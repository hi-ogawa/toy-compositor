import fs from "node:fs";
import path from "node:path";
import { execFileAsync } from "../../utils/exec.ts";
import type { TextClip } from "../project.ts";

/** The fields that decide how a text clip's lines are drawn, without its box. */
type TextDrawing = Pick<
  TextClip,
  "text" | "align" | "font" | "color" | "outline"
>;

/** The PNG is the box's size, so the compiler places it at the box's top-left. */
export async function renderText({
  clip,
  file,
}: {
  clip: TextClip;
  file: string;
}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await execFileAsync("magick", [
    ...getDrawArgs(clip),
    // label: scales the text to fill a -size width and ignores -pointsize, so the text
    // is drawn at its natural size and then extended to the box width by alignment.
    "-gravity",
    getGravity(clip),
    "-extent",
    `${clip.box.width}x%[h]`,
    // Lines start at the top of the box, and lines past its bottom are cut off.
    "-gravity",
    "north",
    "-extent",
    `${clip.box.width}x${clip.box.height}`,
    file,
  ]);
}

/** Measure the height of a text clip's lines as renderText draws them. */
export async function measureTextHeight(clip: TextDrawing): Promise<number> {
  const { stdout } = await execFileAsync("magick", [
    ...getDrawArgs(clip),
    "-format",
    "%h",
    "info:",
  ]);
  return Number(stdout);
}

/** Draw the lines at their natural size, before they are placed in the box. */
function getDrawArgs(clip: TextDrawing): string[] {
  const common = [
    "-background",
    "none",
    "-gravity",
    getGravity(clip),
    "-font",
    getMagickFont(clip.font),
    "-pointsize",
    String(clip.font.size),
    "-interline-spacing",
    String(clip.font.lineSpacing),
    "-fill",
    clip.color,
  ];
  // Draw the outline as a stroked copy underneath the plain text,
  // so the stroke only grows outward like Kdenlive's title outline.
  const outline = clip.outline
    ? [
        "(",
        ...common,
        "-stroke",
        clip.outline.color,
        "-strokewidth",
        String(clip.outline.width),
        `label:${clip.text}`,
        ")",
      ]
    : [];
  return [
    ...outline,
    "(",
    ...common,
    "-stroke",
    "none",
    `label:${clip.text}`,
    ")",
    ...(clip.outline ? ["-gravity", "center", "-composite"] : []),
  ];
}

function getGravity(clip: TextDrawing) {
  return { left: "west", center: "center", right: "east" }[clip.align];
}

/** "Noto Sans CJK KR" at weight 700 -> "Noto-Sans-CJK-KR-Bold" */
function getMagickFont(font: TextClip["font"]) {
  const suffix: Record<number, string> = {
    300: "-Light",
    400: "",
    500: "-Medium",
    700: "-Bold",
    900: "-Black",
  };
  return font.family.replaceAll(" ", "-") + (suffix[font.weight] ?? "");
}
