import { useState, type CSSProperties } from "react";
import { usePointerGesture } from "../hooks/use-pointer-gesture";
import { useResizeObserver } from "../hooks/use-resize-observer";
import type { ProjectClientStorage } from "../lib/client-storage";
import { measureFontMetrics } from "../lib/font-metrics";
import { getPictureRange, getVisibleBox, type BoxHandle } from "../lib/layout";
import type { Box, Project, TextClip, VisualClip } from "../lib/project";
import type { EditorRuntime, EditorProject } from "../lib/runtime";
import { CompositionMedia } from "./composition-media";
import { cn } from "./ui/utils";
import type {
  EditorSelection,
  LayerInteraction,
} from "./use-layer-interaction";

export function CompositionPreview({
  clientStorage,
  project,
  selection,
  time,
  runtime,
  resolveMediaUrl,
  layerInteraction,
  onClearSelection,
}: {
  clientStorage: ProjectClientStorage;
  project: EditorProject;
  selection?: EditorSelection;
  time: number;
  runtime: EditorRuntime;
  resolveMediaUrl: (src: string) => string;
  layerInteraction: LayerInteraction;
  onClearSelection: () => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const viewportRef = useResizeObserver((element) =>
    setSize({ width: element.clientWidth, height: element.clientHeight }),
  );
  const [clipToCanvas, setClipToCanvas] =
    clientStorage.useValue("clipToCanvas");
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
        <button
          type="button"
          title="Hide content outside the canvas, as in the render"
          aria-pressed={clipToCanvas}
          className="ml-auto rounded px-1.5 text-[10px] text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-100 aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
          onClick={() => setClipToCanvas(!clipToCanvas)}
        >
          Clip to canvas
        </button>
      </div>
      <div
        ref={viewportRef}
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden"
        data-testid="composition-viewport"
        // A press that no clip takes lands on empty space, inside the frame or
        // outside it.
        onPointerDown={(event) => {
          if (event.button === 0) {
            onClearSelection();
          }
        }}
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
              background: canvas.background,
            }}
          >
            {/* Every clip stays mounted, so media is ready when playback reaches it. */}
            {layerInteraction.layers.flatMap((layer, index) =>
              layer.clips.map((clip, clipIndex) => {
                if (clip.type === "audio") {
                  return undefined;
                }
                const range = getPictureRange(clip);
                return (
                  <PreviewClip
                    key={clip.id}
                    clip={clip}
                    name={layer.name}
                    visible={
                      !layer.hidden && time >= range.start && time < range.end
                    }
                    runtime={runtime}
                    selected={
                      selection?.type === "clip" && selection.id === clip.id
                    }
                    id={clip.id}
                    testId={`composition-layer-${index}-clip-${clipIndex}`}
                    mediaInfoMap={project.media}
                    resolveMediaUrl={resolveMediaUrl}
                    scale={scale}
                    layerInteraction={layerInteraction}
                  />
                );
              }),
            )}
            {/* Sits above the clips and below the selection outline in
                PreviewClip, and paints over the area outside the frame instead
                of clipping the canvas, so a selected clip's outline still shows
                past the frame. */}
            <div
              className={cn(
                "pointer-events-none absolute inset-0 z-[5] outline outline-neutral-600 ring-[100000px]",
                clipToCanvas ? "ring-neutral-900" : "ring-neutral-900/70",
              )}
              style={{ outlineWidth: 1 / scale }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function PreviewClip({
  clip,
  name,
  visible,
  runtime,
  selected,
  id,
  testId,
  mediaInfoMap,
  resolveMediaUrl,
  scale,
  layerInteraction,
}: {
  clip: VisualClip;
  /** The layer's name, which labels a video. */
  name: string;
  visible: boolean;
  runtime: EditorRuntime;
  selected: boolean;
  id: string;
  testId: string;
  mediaInfoMap: Project["media"];
  resolveMediaUrl: (src: string) => string;
  /** The preview's scale, which converts screen pixels to canvas pixels. */
  scale: number;
  layerInteraction: LayerInteraction;
}) {
  const gestureRef = usePointerGesture({
    onStart: (event) => {
      // Keeps the image's native drag and text selection out, and the press
      // from reaching the viewport, which would clear the selection.
      event.preventDefault();
      event.stopPropagation();
    },
    onClick: () => layerInteraction.select({ type: "clip", id }),
    onDragStart: () =>
      layerInteraction.startCanvasEdit({ edit: { type: "move" }, id, clip }),
    onDragMove: (_event, gesture) =>
      layerInteraction.updateCanvasEdit(toCanvasDelta(gesture, scale)),
    onDragEnd: (_event, gesture) =>
      layerInteraction.finishCanvasEdit(toCanvasDelta(gesture, scale)),
    onCancel: layerInteraction.cancelEdit,
  });
  const box = getPreviewBox({ clip, mediaInfoMap });
  const style: CSSProperties = {
    position: "absolute",
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
  };
  return (
    // The wrapper's children are absolutely positioned, so it takes no area
    // itself and a press reaches it only from the clip's visible rectangle,
    // where a later clip on top takes the press first.
    <div
      ref={gestureRef}
      data-testid={testId}
      hidden={!visible}
      className="cursor-pointer"
    >
      {clip.type === "video" || clip.type === "image" ? (
        <CompositionMedia
          clip={clip}
          name={name}
          mediaInfo={mediaInfoMap[clip.src]}
          runtime={runtime}
          id={id}
          resolveMediaUrl={resolveMediaUrl}
        />
      ) : clip.type === "text" ? (
        // Text past the box is cut off, as in the render.
        <div style={{ ...style, overflow: "hidden" }}>
          <div style={getTextStyle(clip)}>{clip.text}</div>
        </div>
      ) : (
        <div
          style={{ ...style, background: clip.color, opacity: clip.opacity }}
        />
      )}
      {selected && (
        // Above the mask over the area outside the frame.
        <div
          className="pointer-events-none z-10 outline outline-2 outline-primary"
          aria-label="Selected layer outline"
          style={style}
        />
      )}
      {selected &&
        (clip.type === "video" || clip.type === "image") &&
        MEDIA_HANDLES.map((handle) => (
          <ResizeHandle
            key={`${handle.x}-${handle.y}`}
            handle={handle}
            box={box}
            id={id}
            clip={clip}
            scale={scale}
            layerInteraction={layerInteraction}
          />
        ))}
    </div>
  );
}

/** A single scale keeps a media clip's aspect ratio, so it has only corners. */
const MEDIA_HANDLES: BoxHandle[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

/** Screen pixels, so a handle keeps its size at any preview scale. */
const HANDLE_SIZE = 8;

const HANDLE_ROWS = { 0: "top", 0.5: "middle", 1: "bottom" };

const HANDLE_COLUMNS = { 0: "left", 0.5: "center", 1: "right" };

function ResizeHandle({
  handle,
  box,
  id,
  clip,
  scale,
  layerInteraction,
}: {
  handle: BoxHandle;
  box: Box;
  id: string;
  clip: VisualClip;
  scale: number;
  layerInteraction: LayerInteraction;
}) {
  const gestureRef = usePointerGesture({
    onStart: (event) => {
      // Keeps the press from reaching the clip, which would move it.
      event.preventDefault();
      event.stopPropagation();
    },
    onDragStart: () =>
      layerInteraction.startCanvasEdit({
        edit: { type: "resize", handle },
        id,
        clip,
      }),
    onDragMove: (_event, gesture) =>
      layerInteraction.updateCanvasEdit(toCanvasDelta(gesture, scale)),
    onDragEnd: (_event, gesture) =>
      layerInteraction.finishCanvasEdit(toCanvasDelta(gesture, scale)),
    onCancel: layerInteraction.cancelEdit,
  });
  const size = HANDLE_SIZE / scale;
  const name = `${HANDLE_ROWS[handle.y]} ${HANDLE_COLUMNS[handle.x]}`;
  return (
    // Above the mask over the area outside the frame, like the outline.
    <div
      ref={gestureRef}
      aria-label={`Resize handle ${name}`}
      className={cn(
        "absolute z-10 border-primary bg-white",
        handle.x === handle.y ? "cursor-nwse-resize" : "cursor-nesw-resize",
      )}
      style={{
        left: box.x + handle.x * box.width - size / 2,
        top: box.y + handle.y * box.height - size / 2,
        width: size,
        height: size,
        borderWidth: 1 / scale,
      }}
    />
  );
}

/** Convert a pointer's travel on screen to canvas pixels. */
function toCanvasDelta(
  { deltaX, deltaY }: { deltaX: number; deltaY: number },
  scale: number,
) {
  return { x: deltaX / scale, y: deltaY / scale };
}

/** The clip's rectangle in canvas pixels. */
function getPreviewBox({
  clip,
  mediaInfoMap,
}: {
  clip: VisualClip;
  mediaInfoMap: Project["media"];
}): Box {
  switch (clip.type) {
    case "video":
    case "image": {
      return getVisibleBox({
        size: mediaInfoMap[clip.src].video!,
        crop: clip.crop,
        transform: clip.transform,
      });
    }
    case "text":
    case "color": {
      return clip.box;
    }
  }
}

/** Lay the lines out the way the render's ImageMagick label: does. */
function getTextStyle(clip: TextClip): CSSProperties {
  const { ascent, descent } = measureFontMetrics(clip.font);
  const { lineSpacing } = clip.font;
  return {
    fontFamily: clip.font.family,
    fontSize: clip.font.size,
    fontWeight: clip.font.weight,
    // Lines are spaced by the font's ascent and descent, which puts the first
    // baseline at the ascent from the top of the box.
    lineHeight: `${ascent + descent + lineSpacing}px`,
    // CSS splits the line spacing above and below each line, but the render
    // adds it only between lines, so pull the half above the first line back.
    marginTop: -lineSpacing / 2,
    whiteSpace: "pre",
    textAlign: clip.align,
    color: clip.color,
    WebkitTextStroke: clip.outline
      ? `${clip.outline.width}px ${clip.outline.color}`
      : undefined,
    paintOrder: "stroke fill",
  };
}
