import { useState, type CSSProperties } from "react";
import { useResizeObserver } from "../hooks/use-resize-observer";
import { getPictureRange, getVisibleBox } from "../lib/layout";
import type { Box, Clip, Project, TextClip } from "../lib/project";
import type { EditorRuntime, EditorProject } from "../lib/runtime";
import { CompositionMedia } from "./composition-media";
import { cn } from "./ui/utils";
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
  const [clipToCanvas, setClipToCanvas] = useState(false);
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
            {project.layers.flatMap((layer, index) =>
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
                    visible={time >= range.start && time < range.end}
                    runtime={runtime}
                    selected={
                      selection?.type === "clip" && selection.id === clip.id
                    }
                    id={clip.id}
                    testId={`composition-layer-${index}-clip-${clipIndex}`}
                    mediaInfoMap={project.media}
                    resolveMediaUrl={resolveMediaUrl}
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
}: {
  clip: Exclude<Clip, { type: "audio" }>;
  /** The layer's name, which labels a video. */
  name: string;
  visible: boolean;
  runtime: EditorRuntime;
  selected: boolean;
  id: string;
  testId: string;
  mediaInfoMap: Project["media"];
  resolveMediaUrl: (src: string) => string;
}) {
  const box = getPreviewBox({ clip, mediaInfoMap });
  const style: CSSProperties = {
    position: "absolute",
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
  };
  return (
    <div data-testid={testId} hidden={!visible}>
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
        <div style={{ ...style, ...getTextStyle(clip), overflow: "hidden" }}>
          {clip.text}
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
    </div>
  );
}

/** The clip's rectangle in canvas pixels. */
function getPreviewBox({
  clip,
  mediaInfoMap,
}: {
  clip: Exclude<Clip, { type: "audio" }>;
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

function getTextStyle(clip: TextClip): CSSProperties {
  return {
    fontFamily: clip.font.family,
    fontSize: clip.font.size,
    fontWeight: clip.font.weight,
    lineHeight: `${clip.font.size * 1.2 + clip.font.lineSpacing}px`,
    whiteSpace: "pre",
    textAlign: clip.align,
    color: clip.color,
    WebkitTextStroke: clip.outline
      ? `${clip.outline.width}px ${clip.outline.color}`
      : undefined,
    paintOrder: "stroke fill",
  };
}
