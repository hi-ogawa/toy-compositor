import {
  AudioLinesIcon,
  FilmIcon,
  ImageIcon,
  PauseIcon,
  PlayIcon,
  SquareIcon,
  TypeIcon,
  VolumeXIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { EditorProject } from "../lib/editor-project";
import { getLayerRange, type Range } from "../lib/layout";
import type { Layer, Locator, Project } from "../lib/project";
import type { EditorRuntime, EditorSelection } from "../lib/runtime";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import { TIMELINE_LABEL_WIDTH, type TimelineView } from "./use-timeline";

export function Timeline({
  timeline,
  runtime,
  project,
  selection,
  playhead,
  playing,
}: {
  timeline: TimelineView;
  runtime: EditorRuntime;
  project: EditorProject;
  selection?: EditorSelection;
  playhead: number;
  playing: boolean;
}) {
  const selectOutput = () => runtime.select({ type: "output" });
  const seek = (time: number) => runtime.seek(time);
  return (
    <section
      className="flex h-80 shrink-0 flex-col border-t border-neutral-700 text-sm"
      data-testid="editor-timeline"
      aria-label="Timeline"
    >
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
            output={project.output}
            locators={project.locators ?? []}
            renderSelected={selection?.type === "output"}
            onRenderMarkerClick={(time) => {
              selectOutput();
              seek(time);
            }}
            onSeek={seek}
          />
          <TimelineRuler timeline={timeline} onSeek={seek} />
          {/* Top layer first, like tracks in a timeline. */}
          {project.layers
            .map((entry, index) => ({ ...entry, index }))
            .reverse()
            .map(({ id, layer, index }) => (
              <TimelineLayerLane
                key={id}
                timeline={timeline}
                layer={layer}
                index={index}
                range={getLayerRange(layer)}
                selected={selection?.type === "layer" && selection.id === id}
                onSelect={() => runtime.select({ type: "layer", id })}
              />
            ))}
          {timeline.isVisible(playhead) && (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-sky-400"
              data-testid="timeline-playhead"
              style={{
                left: TIMELINE_LABEL_WIDTH + timeline.timeToX(playhead),
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
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
      className="h-10"
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
  output,
  locators,
  renderSelected,
  onRenderMarkerClick,
  onSeek,
}: {
  timeline: TimelineView;
  output: Project["output"];
  locators: Locator[];
  renderSelected: boolean;
  onRenderMarkerClick: (time: number) => void;
  onSeek: (time: number) => void;
}) {
  const renderMarkers =
    output.type === "video"
      ? [
          {
            label: "Render start",
            time: output.start,
            labelSide: "after" as const,
          },
          {
            label: "Render end",
            time: output.end,
            labelSide: "before" as const,
          },
        ]
      : [
          {
            label: "Render frame",
            time: output.time,
            labelSide: "after" as const,
          },
        ];
  return (
    <TimelineRow
      timeline={timeline}
      className="h-7"
      subdivisions={false}
      label={
        <span className="px-3 text-xs font-semibold text-muted-foreground">
          Locators
        </span>
      }
    >
      {/* Seeks from empty space, underneath the markers. */}
      <button
        type="button"
        aria-label="Locator row"
        className="absolute inset-0 cursor-crosshair"
        onClick={(event) =>
          onSeek(
            timeline.xToTime(
              event.clientX - event.currentTarget.getBoundingClientRect().left,
            ),
          )
        }
      />
      {renderMarkers
        .filter((marker) => timeline.isVisible(marker.time))
        .map((marker) => (
          <LocatorMarker
            key={marker.label}
            label={marker.label}
            time={marker.time}
            left={timeline.timeToX(marker.time)}
            labelSide={marker.labelSide}
            render
            selected={renderSelected}
            onClick={() => onRenderMarkerClick(marker.time)}
          />
        ))}
      {locators
        .filter((locator) => timeline.isVisible(locator.time))
        .map((locator, index) => (
          <LocatorMarker
            key={index}
            label={locator.label}
            time={locator.time}
            left={timeline.timeToX(locator.time)}
            labelSide="after"
            render={false}
            selected={false}
            onClick={() => onSeek(locator.time)}
          />
        ))}
    </TimelineRow>
  );
}

function TimelineLayerLane({
  timeline,
  layer,
  index,
  range,
  selected,
  onSelect,
}: {
  timeline: TimelineView;
  layer: Layer;
  index: number;
  range: Range;
  selected: boolean;
  onSelect: () => void;
}) {
  const name = layer.name ?? layer.type;
  const region = timeline.rangeStyle(range);
  return (
    <TimelineRow
      timeline={timeline}
      className="h-12"
      subdivisions
      label={
        <button
          type="button"
          title={name}
          className="flex h-full w-full items-center justify-between gap-2 px-3 text-left hover:bg-neutral-800/60"
          onClick={onSelect}
        >
          <span className="truncate text-xs font-semibold">{name}</span>
          <LayerTypeIcon type={layer.type} />
        </button>
      }
    >
      {region && (
        <button
          type="button"
          aria-label={`Select ${name} region`}
          title={`${range.start.toFixed(3)}–${range.end.toFixed(3)} s`}
          onClick={onSelect}
          data-testid={`timeline-layer-${index}`}
          className={cn(
            "absolute inset-y-1 overflow-hidden rounded-sm border text-left text-[11px]",
            LAYER_CLIP_CLASSES[layer.type].fill,
            selected
              ? "border-sky-300 ring-1 ring-inset ring-sky-300"
              : LAYER_CLIP_CLASSES[layer.type].border,
          )}
          style={region}
        >
          {/* The lane's header already names the layer, so the clip shows only state. */}
          {(layer.type === "video" || layer.type === "audio") &&
            layer.muted && (
              <VolumeXIcon
                role="img"
                aria-label="muted"
                className="absolute left-1 top-1 size-3.5"
              />
            )}
        </button>
      )}
    </TimelineRow>
  );
}

/** Marks the layer type by icon, keeping the header column for the name. */
function LayerTypeIcon({ type }: { type: Layer["type"] }) {
  const Icon = LAYER_TYPE_ICONS[type];
  return (
    <Icon
      role="img"
      aria-label={type}
      className="size-3.5 shrink-0 text-neutral-400"
    >
      <title>{type}</title>
    </Icon>
  );
}

const LAYER_TYPE_ICONS: Record<Layer["type"], LucideIcon> = {
  video: FilmIcon,
  audio: AudioLinesIcon,
  image: ImageIcon,
  text: TypeIcon,
  color: SquareIcon,
};

const LAYER_CLIP_CLASSES: Record<
  Layer["type"],
  { fill: string; border: string }
> = {
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
  label,
  time,
  left,
  labelSide,
  render,
  selected,
  onClick,
}: {
  label: string;
  time: number;
  left: number;
  labelSide: "before" | "after";
  render: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={render ? selected : undefined}
      title={`${label} · ${time.toFixed(3)} s`}
      onClick={onClick}
      style={{
        left,
        transform:
          labelSide === "before"
            ? "translateX(calc(-100% + 6px))"
            : "translateX(-6px)",
      }}
      className={cn(
        "group absolute inset-y-0 flex w-max items-center outline-none hover:text-sky-200 focus-visible:ring-1 focus-visible:ring-sky-300",
        labelSide === "before" ? "pr-4" : "pl-4",
        render ? "z-10 text-primary" : "text-muted-foreground",
        selected && "text-sky-300",
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
  );
}
