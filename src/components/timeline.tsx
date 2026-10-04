import {
  LoaderCircleIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  VolumeXIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePointerDrag } from "../hooks/use-pointer-drag";
import { usePointerGesture } from "../hooks/use-pointer-gesture";
import type { ClipEditType } from "../lib/clip-edit";
import {
  getClipRange,
  getPictureRange,
  intersect,
  type TimeRange,
} from "../lib/layout";
import type { Clip, Output } from "../lib/project";
import type {
  DecodedAudio,
  EditorClip,
  EditorRuntime,
  EditorLayer,
  EditorProject,
} from "../lib/runtime";
import { clamp } from "../utils/math";
import type { PromiseState } from "../utils/promise-state";
import { AudioWaveformView } from "./audio-waveform";
import { ClipTypeIcon } from "./clip-type-icon";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import type {
  EditorSelection,
  LayerInteraction,
} from "./use-layer-interaction";
import type { LocatorInteraction } from "./use-locator-interaction";
import { TIMELINE_LABEL_WIDTH, type TimelineView } from "./use-timeline";

const DEFAULT_TIMELINE_HEIGHT = 320;
const MIN_TIMELINE_HEIGHT = 160;
const MIN_MONITOR_HEIGHT = 160;

export function Timeline({
  timeline,
  layerInteraction,
  locatorInteraction,
  runtime,
  project,
  selection,
  playhead,
  playing,
  audioSources,
  onClearSelection,
}: {
  timeline: TimelineView;
  layerInteraction: LayerInteraction;
  locatorInteraction: LocatorInteraction;
  runtime: EditorRuntime;
  project: EditorProject;
  selection?: EditorSelection;
  playhead: number;
  playing: boolean;
  audioSources: Record<string, PromiseState<DecodedAudio>>;
  onClearSelection: () => void;
}) {
  const [height, setHeight] = useState(DEFAULT_TIMELINE_HEIGHT);
  const resizeRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      const timelineElement = (event.currentTarget as HTMLElement)
        .parentElement!;
      return {
        height,
        editorHeight: timelineElement.parentElement!.clientHeight,
      };
    },
    onMove: (_event, { data, deltaY }) =>
      setHeight(
        clamp(
          data.height - deltaY,
          MIN_TIMELINE_HEIGHT,
          data.editorHeight - MIN_MONITOR_HEIGHT,
        ),
      ),
  });
  const seek = (time: number) => runtime.seek(time);
  const renderMarkers = getRenderMarkers(project.output);
  return (
    <section
      className="relative flex shrink-0 flex-col border-t border-neutral-700 text-sm"
      data-testid="editor-timeline"
      aria-label="Timeline"
      style={{ height }}
    >
      <div
        ref={resizeRef}
        title="Resize timeline"
        className="absolute inset-x-0 top-0 z-40 h-px cursor-ns-resize touch-none bg-neutral-700 after:absolute after:inset-x-0 after:-top-1 after:h-2 hover:bg-neutral-500"
      />
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-neutral-700 bg-neutral-800 px-3 text-xs">
        <h2 className="shrink-0 font-semibold">Timeline</h2>
        <Button
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
          aria-pressed={playing}
          className={cn(
            "size-7",
            playing
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "hover:bg-neutral-700",
          )}
          onClick={() => void runtime.togglePlayback()}
        >
          {playing ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
        </Button>
        <span
          className="font-mono text-xs tabular-nums text-neutral-300"
          data-testid="timeline-time"
        >
          {playhead.toFixed(3)} s
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {/* Measures the graph width and receives wheel scrolling and zoom. */}
        <div
          ref={timeline.viewportRef}
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{ left: TIMELINE_LABEL_WIDTH }}
        />
        <div className="relative">
          <TimelineLocatorRow
            timeline={timeline}
            renderMarkers={renderMarkers}
            locatorInteraction={locatorInteraction}
            renderSelected={selection?.type === "output"}
            onRenderSelect={() => layerInteraction.select({ type: "output" })}
            onClearSelection={onClearSelection}
            onSeek={seek}
          />
          <TimelineRuler timeline={timeline} onSeek={seek} />
          {/* Top layer first, like tracks in a timeline. */}
          {layerInteraction.layers
            .map((layer, index) => ({ layer, index }))
            .reverse()
            .map(({ layer, index }) => (
              <TimelineLayerLane
                key={layer.id}
                timeline={timeline}
                layerInteraction={layerInteraction}
                layer={layer}
                index={index}
                audioSources={audioSources}
                selectedClipId={
                  selection?.type === "clip" ? selection.id : undefined
                }
              />
            ))}
          <div
            className="pointer-events-none absolute inset-y-0 right-0"
            style={{ left: TIMELINE_LABEL_WIDTH }}
          >
            {renderMarkers
              .filter((marker) => timeline.isVisible(marker.time))
              .map((marker) => (
                <div
                  key={marker.type}
                  className="absolute bottom-0 top-7 z-[5] w-px bg-primary/60"
                  data-testid={`timeline-render-guide-${marker.type}`}
                  style={{ left: timeline.timeToX(marker.time) }}
                />
              ))}
            {timeline.isVisible(playhead) && (
              <div
                className="absolute inset-y-0 z-10 w-px bg-sky-400"
                data-testid="timeline-playhead"
                style={{ left: timeline.timeToX(playhead) }}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

type RenderMarker = {
  type: "start" | "end" | "time";
  name: string;
  label: string;
  time: number;
  labelSide: "before" | "after";
};

function getRenderMarkers(output: Output): RenderMarker[] {
  return output.type === "video"
    ? [
        {
          type: "start",
          name: "Render start",
          label: "Start",
          time: output.start,
          labelSide: "after",
        },
        {
          type: "end",
          name: "Render end",
          label: "End",
          time: output.end,
          labelSide: "before",
        },
      ]
    : [
        {
          type: "time",
          name: "Render frame",
          label: "Frame",
          time: output.time,
          labelSide: "after",
        },
      ];
}

function TimelineRuler({
  timeline,
  onSeek,
}: {
  timeline: TimelineView;
  onSeek: (time: number) => void;
}) {
  const { tickStep, visible } = timeline;
  const ticks: number[] = [];
  for (
    let time = Math.ceil(visible.start / tickStep) * tickStep;
    time <= visible.end;
    time += tickStep
  ) {
    ticks.push(time);
  }
  return (
    <TimelineRow
      timeline={timeline}
      className="h-7"
      subdivisions={false}
      label={
        <span className="px-3 text-xs font-semibold text-muted-foreground">
          Layers
        </span>
      }
    >
      <button
        type="button"
        aria-label="Timeline ruler"
        className="relative h-full w-full cursor-crosshair text-left font-mono text-[10px] tabular-nums text-neutral-400"
        onClick={(event) =>
          onSeek(
            timeline.xToTime(
              event.clientX - event.currentTarget.getBoundingClientRect().left,
            ),
          )
        }
      >
        {ticks.map((time) => (
          <span
            key={time}
            className="absolute bottom-1.5 pl-1"
            style={{ left: timeline.timeToX(time) }}
          >
            {Number(time.toFixed(3))}
          </span>
        ))}
      </button>
    </TimelineRow>
  );
}

/** Render boundaries from the output, followed by the project's own locators. */
function TimelineLocatorRow({
  timeline,
  renderMarkers,
  locatorInteraction,
  renderSelected,
  onRenderSelect,
  onClearSelection,
  onSeek,
}: {
  timeline: TimelineView;
  renderMarkers: RenderMarker[];
  locatorInteraction: LocatorInteraction;
  renderSelected: boolean;
  onRenderSelect: () => void;
  onClearSelection: () => void;
  onSeek: (time: number) => void;
}) {
  return (
    <TimelineRow
      timeline={timeline}
      className="h-7"
      subdivisions={false}
      label={
        <div className="flex w-full items-center justify-between px-3 text-xs font-semibold text-muted-foreground">
          <span>Locators</span>
          <Button
            title="Add locator at playhead (L)"
            aria-label="Add locator at playhead"
            className="size-5 hover:bg-neutral-700"
            onClick={locatorInteraction.add}
          >
            <PlusIcon className="size-3" />
          </Button>
        </div>
      }
    >
      {/* Seeks from empty space, underneath the markers. */}
      <button
        type="button"
        aria-label="Locator row"
        className="absolute inset-0 cursor-crosshair"
        onClick={(event) => {
          onClearSelection();
          onSeek(
            timeline.xToTime(
              event.clientX - event.currentTarget.getBoundingClientRect().left,
            ),
          );
        }}
      />
      {renderMarkers
        .filter((marker) => timeline.isVisible(marker.time))
        .map((marker) => (
          <LocatorMarker
            key={marker.type}
            name={marker.name}
            label={marker.label}
            time={marker.time}
            left={timeline.timeToX(marker.time)}
            pixelsPerSecond={timeline.pixelsPerSecond}
            labelSide={marker.labelSide}
            render
            selected={renderSelected}
            onSelect={onRenderSelect}
            onClick={() => onSeek(marker.time)}
            onMove={(time) =>
              locatorInteraction.moveRenderMarker(marker.type, time)
            }
          />
        ))}
      {locatorInteraction.locators
        .filter((locator) => timeline.isVisible(locator.time))
        .map((locator) => (
          <LocatorMarker
            key={locator.id}
            name={locator.label}
            label={locator.label}
            time={locator.time}
            left={timeline.timeToX(locator.time)}
            pixelsPerSecond={timeline.pixelsPerSecond}
            labelSide="after"
            render={false}
            selected={locatorInteraction.selectedId === locator.id}
            onSelect={() => locatorInteraction.select(locator.id)}
            onClick={() => onSeek(locator.time)}
            onMove={(time) => locatorInteraction.move(locator.id, time)}
            onRename={(label) => locatorInteraction.rename(locator.id, label)}
          />
        ))}
    </TimelineRow>
  );
}

function TimelineLayerLane({
  timeline,
  layerInteraction,
  layer,
  index,
  audioSources,
  selectedClipId,
}: {
  timeline: TimelineView;
  layerInteraction: LayerInteraction;
  layer: EditorLayer;
  /** Position in the project, for test ids. */
  index: number;
  audioSources: Record<string, PromiseState<DecodedAudio>>;
  selectedClipId?: string;
}) {
  const { name } = layer;
  return (
    <TimelineRow
      timeline={timeline}
      className="h-12"
      subdivisions
      label={
        <div
          title={name}
          className="flex h-full min-w-0 flex-1 items-center px-3 text-xs font-semibold"
        >
          <span className="truncate">{name}</span>
        </div>
      }
    >
      {layer.clips.map((clip, clipIndex) => (
        <TimelineClip
          key={clip.id}
          timeline={timeline}
          layerInteraction={layerInteraction}
          clip={clip}
          name={name}
          muted={layer.muted}
          testId={`timeline-layer-${index}-clip-${clipIndex}`}
          audioSource={
            clip.type === "video" || clip.type === "audio"
              ? audioSources[clip.src]
              : undefined
          }
          selected={clip.id === selectedClipId}
        />
      ))}
    </TimelineRow>
  );
}

function TimelineClip({
  timeline,
  layerInteraction,
  clip,
  name,
  muted,
  testId,
  audioSource,
  selected,
}: {
  timeline: TimelineView;
  layerInteraction: LayerInteraction;
  clip: EditorClip;
  /** The layer's name, which labels its clips. */
  name: string;
  muted: boolean;
  testId: string;
  audioSource?: PromiseState<DecodedAudio>;
  selected: boolean;
}) {
  const range = getClipRange(clip);
  const region = timeline.rangeStyle(range);
  const pixelsToSeconds = (deltaX: number) => deltaX / timeline.pixelsPerSecond;
  const onSelect = () => layerInteraction.select({ type: "clip", id: clip.id });
  // A click without dragging selects through the button's own click.
  const moveRef = usePointerGesture({
    onStart: (event) => event.preventDefault(),
    onDragStart: () =>
      layerInteraction.startEdit({ type: "move", id: clip.id }),
    onDragMove: (_event, { deltaX }) =>
      layerInteraction.updateEdit(pixelsToSeconds(deltaX)),
    onDragEnd: (_event, { deltaX }) =>
      layerInteraction.finishEdit(pixelsToSeconds(deltaX)),
    onCancel: layerInteraction.cancelEdit,
  });
  const picture = getPictureRange(clip);
  const visible = intersect(range, timeline.visible);
  const audioClip =
    clip.type === "video" || clip.type === "audio" ? clip : undefined;
  return (
    <>
      <TimelineHoldSpan
        timeline={timeline}
        range={{ start: picture.start, end: range.start }}
        testId={`${testId}-hold-before`}
      />
      <TimelineHoldSpan
        timeline={timeline}
        range={{ start: range.end, end: picture.end }}
        testId={`${testId}-hold-after`}
      />
      {region && (
        <div className="absolute inset-y-1" style={region}>
          <button
            ref={moveRef}
            type="button"
            aria-label={`Select ${name} region`}
            title={`${range.start.toFixed(3)}–${range.end.toFixed(3)} s`}
            onClick={onSelect}
            data-testid={testId}
            className={cn(
              "absolute inset-0 cursor-pointer touch-none select-none overflow-hidden rounded-sm border text-left text-[11px]",
              CLIP_CLASSES[clip.type].fill,
              selected
                ? "border-sky-300 ring-1 ring-inset ring-sky-300"
                : CLIP_CLASSES[clip.type].border,
            )}
          >
            {audioClip && visible && audioSource?.status === "fulfilled" && (
              <AudioWaveformView
                audioView={audioSource.value.view}
                sourceStart={audioClip.in + visible.start - audioClip.start}
                sourceEnd={audioClip.in + visible.end - audioClip.start}
                pixelsPerSecond={timeline.pixelsPerSecond}
                dimmed={muted}
              />
            )}
            {/* The lane's header already names the layer, so the clip shows its type and state. */}
            <div className="absolute left-1 top-1 flex gap-1">
              <ClipTypeIcon type={clip.type} />
              {audioClip && muted && (
                <VolumeXIcon
                  role="img"
                  aria-label="muted"
                  className="size-3.5"
                />
              )}
            </div>
            {audioSource?.status === "pending" && (
              <LoaderCircleIcon
                role="img"
                aria-label="loading source"
                className="absolute right-1 top-1 size-3.5 animate-spin text-muted-foreground"
              />
            )}
          </button>
          {/* A region cut off by the viewport has no edge there to trim. */}
          {timeline.isVisible(range.start) && (
            <ClipTrimHandle
              type="trim-start"
              id={clip.id}
              testId={`${testId}-trim-start`}
              timeline={timeline}
              layerInteraction={layerInteraction}
            />
          )}
          {timeline.isVisible(range.end) && (
            <ClipTrimHandle
              type="trim-end"
              id={clip.id}
              testId={`${testId}-trim-end`}
              timeline={timeline}
              layerInteraction={layerInteraction}
            />
          )}
        </div>
      )}
    </>
  );
}

/** A held span beside a region, edited in the inspector, so it takes no pointer input. */
function TimelineHoldSpan({
  timeline,
  range,
  testId,
}: {
  timeline: TimelineView;
  range: TimeRange;
  testId: string;
}) {
  const style = timeline.rangeStyle(range);
  return (
    style && (
      <div
        title={`hold ${range.start.toFixed(3)}–${range.end.toFixed(3)} s`}
        data-testid={testId}
        className="pointer-events-none absolute inset-y-1 rounded-sm border border-dashed border-blue-400/50 bg-blue-400/10"
        style={style}
      />
    )
  );
}

/** A grip on a region's edge, like toy-midi's clip trim handles. */
function ClipTrimHandle({
  type,
  id,
  testId,
  timeline,
  layerInteraction,
}: {
  type: Exclude<ClipEditType, "move">;
  id: string;
  testId: string;
  timeline: TimelineView;
  layerInteraction: LayerInteraction;
}) {
  const pixelsToSeconds = (deltaX: number) => deltaX / timeline.pixelsPerSecond;
  const trimRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      layerInteraction.startEdit({ type, id });
    },
    onMove: (_event, { deltaX }) =>
      layerInteraction.updateEdit(pixelsToSeconds(deltaX)),
    onEnd: (_event, { deltaX }) =>
      layerInteraction.finishEdit(pixelsToSeconds(deltaX)),
    onCancel: layerInteraction.cancelEdit,
  });
  return (
    <div
      ref={trimRef}
      data-testid={testId}
      className={cn(
        "absolute inset-y-0 z-20 w-1.5 cursor-ew-resize touch-none after:absolute after:inset-y-0 after:w-0.5 after:bg-transparent hover:after:bg-white/50",
        type === "trim-start"
          ? "-left-[3px] after:left-[3px]"
          : "-right-[3px] after:right-[3px]",
      )}
    />
  );
}

const CLIP_CLASSES: Record<Clip["type"], { fill: string; border: string }> = {
  video: { fill: "bg-blue-400/20 text-blue-100", border: "border-blue-400/60" },
  audio: {
    fill: "bg-emerald-400/20 text-emerald-100",
    border: "border-emerald-400/60",
  },
  image: {
    fill: "bg-violet-400/20 text-violet-100",
    border: "border-violet-400/60",
  },
  text: {
    fill: "bg-amber-400/20 text-amber-100",
    border: "border-amber-400/60",
  },
  color: { fill: "bg-rose-400/20 text-rose-100", border: "border-rose-400/60" },
};

/** A label column beside a graph cell that shares the timeline's tick grid. */
function TimelineRow({
  timeline,
  className,
  subdivisions,
  label,
  children,
}: {
  timeline: TimelineView;
  className: string;
  /** Header rows show only the labelled ticks, so they stay quieter than lanes. */
  subdivisions: boolean;
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex border-b border-border/50", className)}>
      <div
        className="flex shrink-0 items-center border-r"
        style={{ width: TIMELINE_LABEL_WIDTH }}
      >
        {label}
      </div>
      <div
        className="relative min-w-0 flex-1 overflow-hidden"
        style={getTimelineGridBackground(timeline, { subdivisions })}
      >
        {children}
      </div>
    </div>
  );
}

/** Major lines at labelled ruler ticks over fainter subdivision lines, like toy-midi's bar and subdivision grid. */
function getTimelineGridBackground(
  timeline: TimelineView,
  { subdivisions }: { subdivisions: boolean },
) {
  const layers = [
    { step: timeline.tickStep, color: "rgb(82 82 82)" },
    ...(subdivisions
      ? [{ step: timeline.subdivisionStep, color: "rgb(51 51 51)" }]
      : []),
  ];
  const offsetX = (step: number) =>
    timeline.timeToX(Math.ceil(timeline.visible.start / step) * step);
  return {
    backgroundImage: layers
      .map(
        ({ color }) =>
          `linear-gradient(to right, ${color} 1px, transparent 1px)`,
      )
      .join(", "),
    backgroundSize: layers
      .map(({ step }) => `${step * timeline.pixelsPerSecond}px 100%`)
      .join(", "),
    backgroundPosition: layers
      .map(({ step }) => `${offsetX(step)}px 0`)
      .join(", "),
  };
}

function LocatorMarker({
  name,
  label,
  time,
  left,
  pixelsPerSecond,
  labelSide,
  render,
  selected,
  onSelect,
  onClick,
  onMove,
  onRename,
}: {
  /** Render markers show a short label, and their color says they render. */
  name: string;
  label: string;
  time: number;
  left: number;
  pixelsPerSecond: number;
  labelSide: "before" | "after";
  render: boolean;
  selected: boolean;
  onSelect: () => void;
  onClick: () => void;
  onMove: (time: number) => void;
  /** Render markers always exist under fixed names, so only locators rename. */
  onRename?: (label: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragRef = usePointerGesture({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect();
      return time;
    },
    onClick,
    onDragStart: () => setDragging(true),
    onDragMove: (_event, { data, deltaX }) =>
      onMove(data + deltaX / pixelsPerSecond),
    onDragEnd: () => setDragging(false),
    onCancel: (_event, { data }) => {
      onMove(data);
      setDragging(false);
    },
  });

  function rename() {
    const nextLabel = window.prompt("Rename locator:", label)?.trim();
    if (nextLabel) {
      onRename?.(nextLabel);
    }
  }

  return (
    <div
      className="group/locator absolute inset-y-0 flex w-max items-center gap-0.5"
      style={{
        left,
        zIndex: render || selected ? 10 : undefined,
        transform:
          labelSide === "before"
            ? "translateX(calc(-100% + 6px))"
            : "translateX(-6px)",
      }}
    >
      <button
        ref={dragRef}
        type="button"
        aria-label={name}
        aria-pressed={selected}
        title={`${name} · ${time.toFixed(3)} s\nDrag to move${onRename ? " · Delete to remove" : ""}`}
        className={cn(
          "group relative flex h-full touch-none items-center outline-none hover:text-sky-200 focus-visible:ring-1 focus-visible:ring-sky-300",
          labelSide === "before" ? "pr-4" : "pl-4",
          render ? "text-primary" : "text-muted-foreground",
          selected && "text-sky-300",
          dragging ? "cursor-ew-resize" : "cursor-pointer",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute bottom-1 size-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-current",
            labelSide === "before" ? "right-0" : "left-0",
          )}
        />
        <span
          className={cn(
            "max-w-40 truncate rounded px-1 text-[11px] select-none group-hover:bg-secondary group-focus-visible:bg-sky-300/20",
            selected && "bg-sky-300/20",
          )}
        >
          <span className="inline-block translate-y-px">{label}</span>
        </span>
      </button>
      {onRename && (
        <button
          type="button"
          aria-label={`Rename ${label}`}
          title="Rename locator"
          onClick={rename}
          className={cn(
            "rounded p-0.5 text-neutral-500 opacity-0 outline-none hover:bg-neutral-700 hover:text-sky-200 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-sky-300 group-hover/locator:opacity-100",
            selected && "opacity-100",
          )}
        >
          <PencilIcon className="size-3" />
        </button>
      )}
    </div>
  );
}
