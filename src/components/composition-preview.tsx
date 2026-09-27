import { useCallback, useState, type CSSProperties } from "react";
import { layerRange } from "../lib/editor/layer-regions";
import type { Layer, Project, TextLayer } from "../lib/project";
import type { EditorSelection } from "../lib/runtime";
import { CompositionMedia } from "./composition-media";

export function CompositionPreview({
  project,
  selection,
  time,
}: {
  project: Project;
  selection?: EditorSelection;
  time: number;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const viewportRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
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
            {project.layers.map((layer, index) => {
              const range = layerRange({ layer, project });
              if (
                time < range.start ||
                time >= range.end ||
                layer.type === "audio"
              ) {
                return undefined;
              }
              return (
                <PreviewLayer
                  key={"src" in layer ? `${index}:${layer.src}` : index}
                  layer={layer}
                  time={time}
                  selected={
                    selection?.type === "layer" && selection.index === index
                  }
                  index={index}
                  canvas={canvas}
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
  time,
  selected,
  index,
  canvas,
}: {
  layer: Exclude<Layer, { type: "audio" }>;
  time: number;
  selected: boolean;
  index: number;
  canvas: Project["canvas"];
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
    <div data-testid={`composition-layer-${index}`}>
      {layer.type === "video" || layer.type === "image" ? (
        <CompositionMedia layer={layer} time={time} />
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
