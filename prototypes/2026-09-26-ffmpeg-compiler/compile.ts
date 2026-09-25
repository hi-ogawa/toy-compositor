// Compile a project into ffmpeg arguments.
// The graph starts from a solid canvas and overlays each visual layer in order.
// Audio layers are trimmed, faded, delayed, and mixed.

import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Box, Crop, Project } from "./project.ts";
import { renderText } from "./text.ts";

type Range = { start: number; end: number };

export function compile({
  project,
  projectDir,
  outFile,
}: {
  project: Project;
  projectDir: string;
  outFile: string;
}): string[] {
  const { canvas } = project;
  const range = outputRange(project);
  const duration = range.end - range.start;
  const inputs: string[][] = [];
  const filters: string[] = [];
  const audioLabels: string[] = [];
  const resolve = (src: string) => path.resolve(projectDir, src);

  filters.push(
    `color=c=${canvas.background ?? "#000000"}:s=${canvas.width}x${canvas.height}:r=${canvas.fps}:d=${duration}[base0]`,
  );
  let base = "base0";
  const overlay = ({ label, x, y }: { label: string; x: number; y: number }) => {
    const next = `base${filters.length}`;
    filters.push(`[${base}][${label}]overlay=x=${x}:y=${y}:eof_action=pass[${next}]`);
    base = next;
  };

  project.layers.forEach((layer, i) => {
    switch (layer.type) {
      case "video": {
        const visible = intersect({ start: layer.start, end: layer.start + layer.out - layer.in }, range);
        if (!visible) return;
        const k = inputs.push(seekInput({ src: resolve(layer.src), seek: layer.in + visible.start - layer.start, duration: visible.end - visible.start })) - 1;
        const fit = fitBox({ source: probeSize(resolve(layer.src)), crop: layer.crop, box: layer.box });
        filters.push(
          `[${k}:v]fps=${canvas.fps},setpts=PTS-STARTPTS+${visible.start - range.start}/TB,${cropFilter(layer.crop)}scale=${fit.width}:${fit.height}[v${i}]`,
        );
        overlay({ label: `v${i}`, x: fit.x, y: fit.y });
        return;
      }
      case "image": {
        const visible = intersect({ start: layer.start ?? range.start, end: layer.end ?? range.end }, range);
        if (!visible) return;
        const k = inputs.push(stillInput({ src: resolve(layer.src), fps: canvas.fps, duration: visible.end - visible.start })) - 1;
        const fit = fitBox({ source: probeSize(resolve(layer.src)), crop: layer.crop, box: layer.box });
        filters.push(
          `[${k}:v]${cropFilter(layer.crop)}scale=${fit.width}:${fit.height},setpts=PTS-STARTPTS+${visible.start - range.start}/TB[v${i}]`,
        );
        overlay({ label: `v${i}`, x: fit.x, y: fit.y });
        return;
      }
      case "text": {
        const visible = intersect({ start: layer.start ?? range.start, end: layer.end ?? range.end }, range);
        if (!visible) return;
        const file = path.join(path.dirname(outFile), ".text", `${path.basename(outFile)}.${i}.png`);
        renderText({ layer, file });
        const k = inputs.push(stillInput({ src: file, fps: canvas.fps, duration: visible.end - visible.start })) - 1;
        filters.push(`[${k}:v]setpts=PTS-STARTPTS+${visible.start - range.start}/TB[v${i}]`);
        // The stroked copy pads the PNG by half the outline width, so shift it back up.
        overlay({ label: `v${i}`, x: layer.box.x, y: layer.box.y - Math.round((layer.outline?.width ?? 0) / 2) });
        return;
      }
      case "color": {
        const visible = intersect({ start: layer.start ?? range.start, end: layer.end ?? range.end }, range);
        if (!visible) return;
        const box = layer.box ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
        filters.push(
          `color=c=${layer.color}@${layer.opacity ?? 1}:s=${box.width}x${box.height}:r=${canvas.fps}:d=${visible.end - visible.start},format=rgba,setpts=PTS-STARTPTS+${visible.start - range.start}/TB[v${i}]`,
        );
        overlay({ label: `v${i}`, x: box.x, y: box.y });
        return;
      }
      case "audio": {
        if (project.output.type === "still") return;
        const visible = intersect({ start: layer.start, end: layer.start + layer.out - layer.in }, range);
        if (!visible) return;
        const layerDuration = visible.end - visible.start;
        const k = inputs.push(seekInput({ src: resolve(layer.src), seek: layer.in + visible.start - layer.start, duration: layerDuration })) - 1;
        const fades = [
          layer.fadeIn ? `afade=t=in:st=0:d=${layer.fadeIn}` : "",
          layer.fadeOut ? `afade=t=out:st=${layerDuration - layer.fadeOut}:d=${layer.fadeOut}` : "",
        ].filter(Boolean);
        const delayMs = Math.round((visible.start - range.start) * 1000);
        filters.push(
          `[${k}:a]${["aformat=sample_rates=48000:channel_layouts=stereo", ...fades, `adelay=delays=${delayMs}:all=1`].join(",")}[a${i}]`,
        );
        audioLabels.push(`a${i}`);
        return;
      }
    }
  });

  filters.push(`[${base}]format=yuv420p[vout]`);
  const outputArgs = ["-map", "[vout]"];
  if (project.output.type === "still") {
    outputArgs.push("-frames:v", "1", "-update", "1");
  } else {
    outputArgs.push("-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", String(canvas.fps), "-t", String(duration));
    if (audioLabels.length > 0) {
      filters.push(
        `${audioLabels.map((l) => `[${l}]`).join("")}amix=inputs=${audioLabels.length}:normalize=0:duration=longest,apad,atrim=0:${duration}[aout]`,
      );
      outputArgs.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
    }
    outputArgs.push("-movflags", "+faststart");
  }

  return [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-stats",
    "-y",
    ...inputs.flat(),
    "-filter_complex",
    filters.join(";\n"),
    ...outputArgs,
    outFile,
  ];
}

function outputRange(project: Project): Range {
  const { output, canvas } = project;
  return output.type === "video" ? output : { start: output.time, end: output.time + 1 / canvas.fps };
}

function intersect(a: Range, b: Range): Range | undefined {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : undefined;
}

function seekInput({ src, seek, duration }: { src: string; seek: number; duration: number }) {
  return ["-ss", seek.toFixed(3), "-t", duration.toFixed(3), "-i", src];
}

function stillInput({ src, fps, duration }: { src: string; fps: number; duration: number }) {
  return ["-loop", "1", "-framerate", String(fps), "-t", duration.toFixed(3), "-i", src];
}

// Scale the cropped source to fit inside the box, keeping its aspect ratio, centered.
function fitBox({ source, crop = {}, box }: { source: { width: number; height: number }; crop?: Crop; box: Box }) {
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

function cropFilter(crop?: Crop) {
  if (!crop) return "";
  const { left = 0, right = 0, top = 0, bottom = 0 } = crop;
  return `crop=iw*${1 - left - right}:ih*${1 - top - bottom}:iw*${left}:ih*${top},`;
}

function probeSize(file: string) {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    file,
  ]).toString();
  const [width, height] = out.trim().split(",").map(Number);
  return { width, height };
}
