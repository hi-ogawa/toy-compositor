import { useState, type CSSProperties } from "react";
import { useResizeObserver } from "../hooks/use-resize-observer";
import { layerRange, outputRange, type Range } from "../lib/layout";
import type { AudioLayer, Layer, Project, TextLayer } from "../lib/project";
import type { EditorSelection } from "../lib/runtime";
import type { AudioContextTransport } from "../lib/transport";
import { CompositionMedia } from "./composition-media";
import { useMediaPlayback } from "./use-media-playback";

export function CompositionPreview({
  project,
  selection,
  time,
  transport,
  resolveMediaUrl,
}: {
  project: Project;
  selection?: EditorSelection;
  time: number;
  transport: AudioContextTransport;
  resolveMediaUrl: (src: string) => string;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const viewportRef = useResizeObserver((element) =>
    setSize({ width: element.clientWidth, height: element.clientHeight }),
  );
  const { canvas } = project;
  const output = outputRange(project);
  const scale = Math.min(
    size.width / canvas.width,
    size.height / canvas.height,
  );
  return (
    <>
      <div
        ref={viewportRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        data-testid="composition-viewport"
      >
        <div
          className="relative shrink-0"
          style={{ width: canvas.width * scale, height: canvas.height * scale }}
        >
          <div
            className="absolute origin-top-left overflow-hidden"
            data-testid="composition-canvas"
            style={{
              width: canvas.width,
              height: canvas.height,
              transform: `scale(${scale})`,
              background: canvas.background ?? "#000000",
            }}
          >
            {/* Every layer stays mounted, so media is ready when playback reaches it. */}
            {project.layers.map((layer, index) => {
              if (layer.type === "audio") {
                return undefined;
              }
              const range = layerRange(layer);
              return (
                <PreviewLayer
                  key={"src" in layer ? `${index}:${layer.src}` : index}
                  layer={layer}
                  visible={time >= range.start && time < range.end}
                  transport={transport}
                  output={output}
                  selected={
                    selection?.type === "layer" && selection.index === index
                  }
                  index={index}
                  canvas={canvas}
                  resolveMediaUrl={resolveMediaUrl}
                />
              );
            })}
          </div>
        </div>
      </div>
      {project.layers.map(
        (layer, index) =>
          layer.type === "audio" && (
            <PreviewAudio
              key={`${index}:${layer.src}`}
              layer={layer}
              transport={transport}
              output={output}
              src={resolveMediaUrl(layer.src)}
            />
          ),
      )}
      <p
        className="mt-2 text-xs tabular-nums text-muted-foreground"
        data-testid="composition-time"
      >
        Project time {time.toFixed(3)} s · {canvas.width} × {canvas.height} ·{" "}
        {canvas.fps} fps
      </p>
    </>
  );
}

function PreviewLayer({
  layer,
  visible,
  transport,
  output,
  selected,
  index,
  canvas,
  resolveMediaUrl,
}: {
  layer: Exclude<Layer, { type: "audio" }>;
  visible: boolean;
  transport: AudioContextTransport;
  output: Range;
  selected: boolean;
  index: number;
  canvas: Project["canvas"];
  resolveMediaUrl: (src: string) => string;
}) {
  const box: TextLayer["box"] & { height?: number } =
    layer.type === "color"
      ? (layer.box ?? {
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
        })
      : layer.box;
  const style: CSSProperties = {
    position: "absolute",
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
  };
  return (
    <div data-testid={`composition-layer-${index}`} hidden={!visible}>
      {layer.type === "video" || layer.type === "image" ? (
        <CompositionMedia
          layer={layer}
          transport={transport}
          output={output}
          resolveMediaUrl={resolveMediaUrl}
        />
      ) : layer.type === "text" ? (
        <div style={{ ...style, ...textStyle(layer) }}>{layer.text}</div>
      ) : (
        <div
          style={{ ...style, background: layer.color, opacity: layer.opacity }}
        />
      )}
      {selected && (
        <div
          className="pointer-events-none z-10 outline outline-2 outline-primary"
          aria-label="Selected layer outline"
          style={style}
        >
          {layer.type === "text" && (
            <div className="invisible" style={textStyle(layer)}>
              {layer.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Audio layers play through elements outside the canvas, since they draw nothing. */
function PreviewAudio({
  layer,
  transport,
  output,
  src,
}: {
  layer: AudioLayer;
  transport: AudioContextTransport;
  output: Range;
  src: string;
}) {
  const playbackRef = useMediaPlayback({ transport, layer, output });
  return (
    <audio
      ref={playbackRef}
      src={src}
      preload="auto"
      aria-label={layer.name ?? layer.src}
    />
  );
}

function textStyle(layer: TextLayer): CSSProperties {
  return {
    fontFamily: layer.font.family,
    fontSize: layer.font.size,
    fontWeight: layer.font.weight ?? 400,
    lineHeight: `${layer.font.size * 1.2 + (layer.font.lineSpacing ?? 0)}px`,
    whiteSpace: "pre",
    textAlign: layer.align ?? "left",
    color: layer.color,
    WebkitTextStroke: layer.outline
      ? `${layer.outline.width}px ${layer.outline.color}`
      : undefined,
    paintOrder: "stroke fill",
  };
}
