// Draw a project's layers with Remotion elements.
// Composition frame 0 is the start of the project's output range.

import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, staticFile } from "remotion";
import type {
  AudioLayer,
  Box,
  Crop,
  Layer,
  Project,
  TextLayer,
} from "../../2026-09-26-ffmpeg-compiler/project.ts";

export type Size = { width: number; height: number };

export type ProjectProps = Project & { sizes?: Record<string, Size> };

type Range = { start: number; end: number };

export function ProjectComposition(props: ProjectProps) {
  const { canvas, output, layers, sizes = {} } = props;
  const range = outputRange(props);
  return (
    <AbsoluteFill style={{ backgroundColor: canvas.background ?? "#000000" }}>
      {layers.map((layer, i) => (
        <LayerView key={i} layer={layer} range={range} fps={canvas.fps} sizes={sizes} still={output.type === "still"} />
      ))}
    </AbsoluteFill>
  );
}

function LayerView({
  layer,
  range,
  fps,
  sizes,
  still,
}: {
  layer: Layer;
  range: Range;
  fps: number;
  sizes: Record<string, Size>;
  still: boolean;
}) {
  switch (layer.type) {
    case "video": {
      const visible = intersect({ start: layer.start, end: layer.start + layer.out - layer.in }, range);
      if (!visible) return null;
      const seek = layer.in + visible.start - layer.start;
      return (
        <Timed visible={visible} range={range} fps={fps}>
          <Fitted size={sizes[layer.src]} box={layer.box} crop={layer.crop}>
            <OffthreadVideo src={staticFile(layer.src)} trimBefore={Math.round(seek * fps)} muted style={fill} />
          </Fitted>
        </Timed>
      );
    }
    case "image": {
      const visible = intersect({ start: layer.start ?? range.start, end: layer.end ?? range.end }, range);
      if (!visible) return null;
      return (
        <Timed visible={visible} range={range} fps={fps}>
          <Fitted size={sizes[layer.src]} box={layer.box} crop={layer.crop}>
            <Img src={staticFile(layer.src)} style={fill} />
          </Fitted>
        </Timed>
      );
    }
    case "text": {
      const visible = intersect({ start: layer.start ?? range.start, end: layer.end ?? range.end }, range);
      if (!visible) return null;
      return (
        <Timed visible={visible} range={range} fps={fps}>
          <Text layer={layer} />
        </Timed>
      );
    }
    case "color": {
      const visible = intersect({ start: layer.start ?? range.start, end: layer.end ?? range.end }, range);
      if (!visible) return null;
      const box = layer.box;
      return (
        <Timed visible={visible} range={range} fps={fps}>
          <div
            style={{
              position: "absolute",
              ...(box ? { left: box.x, top: box.y, width: box.width, height: box.height } : { inset: 0 }),
              backgroundColor: layer.color,
              opacity: layer.opacity ?? 1,
            }}
          />
        </Timed>
      );
    }
    case "audio": {
      if (still) return null;
      const visible = intersect({ start: layer.start, end: layer.start + layer.out - layer.in }, range);
      if (!visible) return null;
      const seek = layer.in + visible.start - layer.start;
      return (
        <Timed visible={visible} range={range} fps={fps}>
          <Audio
            src={staticFile(layer.src)}
            trimBefore={Math.round(seek * fps)}
            volume={(frame) => fadeVolume({ layer, frame, fps, duration: visible.end - visible.start })}
          />
        </Timed>
      );
    }
  }
}

function Timed({ visible, range, fps, children }: { visible: Range; range: Range; fps: number; children: ReactNode }) {
  return (
    <Sequence
      from={Math.round((visible.start - range.start) * fps)}
      durationInFrames={Math.max(1, Math.round((visible.end - visible.start) * fps))}
      layout="none"
    >
      {children}
    </Sequence>
  );
}

// Same fit math as the ffmpeg compiler, so both renderers place layers identically.
// The cropped source is scaled to fit inside the box, keeping its aspect ratio, centered.
// The outer div clips the crop, and the inner div holds the whole scaled source.
function Fitted({ size, box, crop = {}, children }: { size: Size; box: Box; crop?: Crop; children: ReactNode }) {
  const { left = 0, right = 0, top = 0, bottom = 0 } = crop;
  const cw = size.width * (1 - left - right);
  const ch = size.height * (1 - top - bottom);
  const scale = Math.min(box.width / cw, box.height / ch);
  const width = even(cw * scale);
  const height = even(ch * scale);
  const x = Math.round(box.x + (box.width - width) / 2);
  const y = Math.round(box.y + (box.height - height) / 2);
  const sx = width / cw;
  const sy = height / ch;
  return (
    <div style={{ position: "absolute", left: x, top: y, width, height, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: -left * size.width * sx,
          top: -top * size.height * sy,
          width: size.width * sx,
          height: size.height * sy,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Text({ layer }: { layer: TextLayer }) {
  const { font, outline } = layer;
  const lineSpacing = font.lineSpacing ?? 0;
  return (
    <div
      style={{
        position: "absolute",
        left: layer.box.x,
        // CSS splits a negative line spacing above and below each line, which moves the
        // first line up. The format applies line spacing only between lines, so undo that.
        top: layer.box.y - lineSpacing / 2,
        width: layer.box.width,
        textAlign: layer.align ?? "left",
        fontFamily: `"${font.family}"`,
        fontSize: font.size,
        fontWeight: font.weight ?? 400,
        lineHeight: `${font.size * NORMAL_LINE_HEIGHT + lineSpacing}px`,
        color: layer.color,
        whiteSpace: "pre",
        ...(outline && { WebkitTextStroke: `${outline.width}px ${outline.color}`, paintOrder: "stroke fill" }),
      }}
    >
      {layer.text}
    </div>
  );
}

// Noto Sans CJK's ascent plus descent, which ImageMagick uses as the default line height.
const NORMAL_LINE_HEIGHT = 1.448;

function fadeVolume({ layer, frame, fps, duration }: { layer: AudioLayer; frame: number; fps: number; duration: number }) {
  const t = frame / fps;
  const fadeIn = layer.fadeIn ? interpolate(t, [0, layer.fadeIn], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const fadeOut = layer.fadeOut
    ? interpolate(t, [duration - layer.fadeOut, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  return Math.min(fadeIn, fadeOut);
}

export function outputRange(project: Project): Range {
  const { output, canvas } = project;
  return output.type === "video" ? output : { start: output.time, end: output.time + 1 / canvas.fps };
}

function intersect(a: Range, b: Range): Range | undefined {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : undefined;
}

function even(n: number) {
  return Math.max(2, 2 * Math.round(n / 2));
}

const fill: CSSProperties = { width: "100%", height: "100%" };
