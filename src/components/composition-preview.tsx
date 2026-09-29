import { useState, type CSSProperties } from "react";
import { useResizeObserver } from "../hooks/use-resize-observer";
import type { EditorProject } from "../lib/editor-project";
import { getLayerRange } from "../lib/layout";
import type { Layer, Project, TextLayer } from "../lib/project";
import type { EditorRuntime, EditorSelection } from "../lib/runtime";
import { CompositionMedia } from "./composition-media";

export function CompositionPreview({
  project,
  selection,
  time,
  runtime,
  resolveMediaUrl,
}: {
  project: EditorProject;
  selection?: EditorSelection;
  time: number;
  runtime: EditorRuntime;
  resolveMediaUrl: (src: string) => string;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const viewportRef = useResizeObserver((element) =>
    setSize({ width: element.clientWidth, height: element.clientHeight }),
  );
  const { canvas } = project;
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
            {project.layers.map(({ id, layer }, index) => {
              if (layer.type === "audio") {
                return undefined;
              }
              const range = getLayerRange(layer);
              return (
                <PreviewLayer
                  key={id}
                  layer={layer}
                  visible={time >= range.start && time < range.end}
                  runtime={runtime}
                  selected={selection?.type === "layer" && selection.id === id}
                  id={id}
                  index={index}
                  canvas={canvas}
                  resolveMediaUrl={resolveMediaUrl}
                />
              );
            })}
          </div>
        </div>
      </div>
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
  runtime,
  selected,
  id,
  index,
  canvas,
  resolveMediaUrl,
}: {
  layer: Exclude<Layer, { type: "audio" }>;
  visible: boolean;
  runtime: EditorRuntime;
  selected: boolean;
  id: string;
  /** Position in the project, which only labels the element for tests. */
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
          runtime={runtime}
          id={id}
          resolveMediaUrl={resolveMediaUrl}
        />
      ) : layer.type === "text" ? (
        <div style={{ ...style, ...getTextStyle(layer) }}>{layer.text}</div>
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
            <div className="invisible" style={getTextStyle(layer)}>
              {layer.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getTextStyle(layer: TextLayer): CSSProperties {
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
