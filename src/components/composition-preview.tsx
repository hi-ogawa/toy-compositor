import { useState, type CSSProperties } from "react";
import { useResizeObserver } from "../hooks/use-resize-observer";
import { getPictureRange, getVisibleBox } from "../lib/layout";
import type { Box, Layer, Project, TextLayer } from "../lib/project";
import type { EditorRuntime, EditorProject } from "../lib/runtime";
import { CompositionMedia } from "./composition-media";
import type { EditorSelection } from "./use-layer-interaction";

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
  // Leaves a margin around the frame, so layers overflowing it stay visible.
  const scale =
    0.9 * Math.min(size.width / canvas.width, size.height / canvas.height);
  return (
    <>
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-3 text-xs">
        <h2 className="shrink-0 font-semibold">Composition</h2>
        <span
          className="font-mono text-[10px] tabular-nums text-neutral-400"
          data-testid="composition-readout"
        >
          {canvas.width} × {canvas.height} · {canvas.fps} fps
        </span>
      </div>
      <div
        ref={viewportRef}
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden"
        data-testid="composition-viewport"
      >
        <div
          className="relative shrink-0"
          style={{
            width: canvas.width * scale,
            height: canvas.height * scale,
          }}
        >
          <div
            className="absolute origin-top-left"
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
              const range = getPictureRange(layer);
              return (
                <PreviewLayer
                  key={layer.id}
                  layer={layer}
                  visible={time >= range.start && time < range.end}
                  runtime={runtime}
                  selected={
                    selection?.type === "layer" && selection.id === layer.id
                  }
                  id={layer.id}
                  index={index}
                  mediaInfoMap={project.media}
                  resolveMediaUrl={resolveMediaUrl}
                />
              );
            })}
            {/* Dims everything outside the frame, below the selection outline,
                and marks the frame edge with a 1px screen line just outside it. */}
            <div
              className="pointer-events-none absolute inset-0 z-[5] outline outline-neutral-600 ring-[100000px] ring-neutral-900/70"
              style={{ outlineWidth: 1 / scale }}
            />
          </div>
        </div>
      </div>
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
  mediaInfoMap,
  resolveMediaUrl,
}: {
  layer: Exclude<Layer, { type: "audio" }>;
  visible: boolean;
  runtime: EditorRuntime;
  selected: boolean;
  id: string;
  /** Position in the project, for test ids. */
  index: number;
  mediaInfoMap: Project["media"];
  resolveMediaUrl: (src: string) => string;
}) {
  const box = getPreviewBox({ layer, mediaInfoMap });
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
          mediaInfo={mediaInfoMap[layer.src]}
          runtime={runtime}
          id={id}
          resolveMediaUrl={resolveMediaUrl}
        />
      ) : layer.type === "text" ? (
        // Text past the box is cut off, as in the render.
        <div style={{ ...style, ...getTextStyle(layer), overflow: "hidden" }}>
          {layer.text}
        </div>
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
        />
      )}
    </div>
  );
}

/** The layer's rectangle in canvas pixels. */
function getPreviewBox({
  layer,
  mediaInfoMap,
}: {
  layer: Exclude<Layer, { type: "audio" }>;
  mediaInfoMap: Project["media"];
}): Box {
  switch (layer.type) {
    case "video":
    case "image": {
      return getVisibleBox({
        size: mediaInfoMap[layer.src].video!,
        crop: layer.crop,
        transform: layer.transform,
      });
    }
    case "text":
    case "color": {
      return layer.box;
    }
  }
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
