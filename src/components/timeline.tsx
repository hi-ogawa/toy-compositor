import { PauseIcon, PlayIcon } from "lucide-react";
import type { ReactNode } from "react";
import { getLayerRange, type Range } from "../lib/layout";
import type { Layer, Locator, Project } from "../lib/project";
import type { EditorRuntime, EditorSelection } from "../lib/runtime";
import { PanelHeader } from "./panel-header";
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
  project: Project;
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
      <PanelHeader title="Timeline" sizeClassName="h-10 gap-3">
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
      </PanelHeader>
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
            .map((layer, index) => ({ layer, index }))
            .reverse()
            .map(({ layer, index }) => (
              <TimelineLayerLane
                key={index}
                timeline={timeline}
                layer={layer}
                index={index}
                range={getLayerRange(layer)}
                selected={
                  selection?.type === "layer" && selection.index === index
                }
                onSelect={() => runtime.select({ type: "layer", index })}
              />
            ))}
          {timeline.isVisible(playhead) && (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red-400"
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
      label={
        <span className="px-3 text-xs font-semibold text-muted-foreground">
          Layers
        </span>
      }
    >
      <button
        type="button"
        aria-label="Timeline ruler"
        className="relative h-full w-full cursor-crosshair text-left text-xs tabular-nums text-muted-foreground"
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
            className="absolute bottom-1.5 border-l border-border pl-1"
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
      label={
        <span className="px-3 text-xs font-semibold text-muted-foreground">
          Locators
        </span>
      }
    >
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
      label={
        <button
          type="button"
          className={cn(
            "flex h-full w-full items-center justify-between gap-2 px-3 text-left hover:bg-secondary",
            selected && "bg-accent",
          )}
          onClick={onSelect}
        >
          <span>{name}</span>
          <span className="text-xs text-muted-foreground">{layer.type}</span>
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
            "absolute inset-y-1.5 overflow-hidden rounded border px-2 text-left text-xs",
            layer.type === "audio"
              ? "border-emerald-800 bg-emerald-950"
              : "border-blue-800 bg-blue-950",
            selected && "outline outline-1 outline-primary",
          )}
          style={region}
        >
          {name}
          {(layer.type === "video" || layer.type === "audio") &&
            layer.muted &&
            " · muted"}
        </button>
      )}
    </TimelineRow>
  );
}

/** A label column beside a graph cell that shares the timeline's tick grid. */
function TimelineRow({
  timeline,
  className,
  label,
  children,
}: {
  timeline: TimelineView;
  className: string;
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
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px)",
          backgroundSize: `${timeline.tickStep * timeline.pixelsPerSecond}px 100%`,
          backgroundPositionX: `${timeline.timeToX(Math.ceil(timeline.visible.start / timeline.tickStep) * timeline.tickStep)}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
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
