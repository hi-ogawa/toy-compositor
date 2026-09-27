import type { CSSProperties, ReactNode } from "react";
import { layerRange } from "../lib/editor/layer-regions";
import { intersect, outputRange, type Range } from "../lib/layout";
import type { Project } from "../lib/project";
import type { EditorRuntime, EditorSelection } from "../lib/runtime";
import { cn } from "./ui/utils";
import { TIMELINE_LABEL_WIDTH, useTimeline } from "./use-timeline";

export function Timeline({
  runtime,
  project,
  selection,
  playhead,
}: {
  runtime: EditorRuntime;
  project: Project;
  selection?: EditorSelection;
  playhead: number;
}) {
  const timeline = useTimeline({ project });
  const tickStep = rulerStep(timeline.pixelsPerSecond);
  const ticks: number[] = [];
  for (
    let time = Math.ceil(timeline.visibleStart / tickStep) * tickStep;
    time <= timeline.visibleEnd;
    time += tickStep
  ) {
    ticks.push(time);
  }
  const output = outputRange(project);
  const visible = { start: timeline.visibleStart, end: timeline.visibleEnd };
  const regionStyle = (range: Range): CSSProperties | undefined => {
    const clipped = intersect(range, visible);
    return clipped
      ? {
          left: timeline.timeToX(clipped.start),
          width: (clipped.end - clipped.start) * timeline.pixelsPerSecond,
        }
      : undefined;
  };
  const graphStyle: CSSProperties = {
    width: timeline.timeWidth,
    backgroundImage:
      "linear-gradient(to right, var(--border) 1px, transparent 1px)",
    backgroundSize: `${tickStep * timeline.pixelsPerSecond}px 100%`,
    backgroundPositionX: `${timeline.timeToX(Math.ceil(timeline.start / tickStep) * tickStep)}px`,
  };
  const selectOutput = () => runtime.select({ type: "output" });
  return (
    <section
      className="flex h-72 shrink-0 flex-col border-t border-border text-sm"
      data-testid="editor-timeline"
      aria-label="Timeline"
    >
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <h2 className="font-medium">Timeline</h2>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs hover:bg-secondary"
          onClick={selectOutput}
        >
          Render settings
        </button>
        <span
          className="text-xs tabular-nums text-muted-foreground"
          data-testid="timeline-time"
        >
          {playhead.toFixed(3)} s · {project.canvas.fps} fps
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs">
          Zoom
          <input
            type="range"
            aria-label="Timeline zoom"
            min={1}
            max={9}
            step={0.1}
            value={Math.log2(timeline.pixelsPerSecond)}
            onChange={(event) =>
              timeline.setZoom(2 ** Number(event.target.value))
            }
            className="w-24"
          />
        </label>
      </div>
      <div
        ref={timeline.viewportRef}
        onScroll={timeline.onScroll}
        className="min-h-0 flex-1 overflow-auto"
        data-testid="timeline-scroll"
      >
        <div
          className="relative"
          style={{
            width: TIMELINE_LABEL_WIDTH + timeline.timeWidth,
            minHeight: "100%",
          }}
        >
          <TimelineRow
            label={<span>Time · seconds</span>}
            graphStyle={graphStyle}
          >
            <button
              type="button"
              aria-label="Timeline ruler"
              className="relative h-full w-full cursor-crosshair text-left text-xs tabular-nums text-muted-foreground"
              onClick={(event) =>
                runtime.seek({
                  time: timeline.xToTime(
                    event.clientX -
                      event.currentTarget.getBoundingClientRect().left,
                  ),
                })
              }
            >
              {ticks.map((time) => (
                <span
                  key={time}
                  className="absolute top-1 border-l border-border pl-1"
                  style={{ left: timeline.timeToX(time) }}
                >
                  {Number(time.toFixed(3))}
                </span>
              ))}
            </button>
          </TimelineRow>
          <TimelineRow
            label={
              <span className="px-3 text-xs font-semibold text-muted-foreground">
                Locators
              </span>
            }
            graphStyle={graphStyle}
          >
            {(project.output.type === "video"
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
                    time: output.start,
                    labelSide: "after" as const,
                  },
                ]
            )
              .filter(
                (marker) =>
                  marker.time >= visible.start && marker.time <= visible.end,
              )
              .map((marker) => (
                <LocatorMarker
                  key={marker.label}
                  label={marker.label}
                  time={marker.time}
                  left={timeline.timeToX(marker.time)}
                  labelSide={marker.labelSide}
                  render
                  selected={selection?.type === "output"}
                  onClick={() => {
                    selectOutput();
                    runtime.seek({ time: marker.time });
                  }}
                />
              ))}
            {(project.locators ?? [])
              .filter(
                (locator) =>
                  locator.time >= visible.start && locator.time <= visible.end,
              )
              .map((locator, index) => (
                <LocatorMarker
                  key={index}
                  label={locator.label}
                  time={locator.time}
                  left={timeline.timeToX(locator.time)}
                  labelSide="after"
                  render={false}
                  selected={false}
                  onClick={() => runtime.seek({ time: locator.time })}
                />
              ))}
          </TimelineRow>
          {project.layers
            .map((layer, index) => ({ layer, index }))
            .reverse()
            .map(({ layer, index }) => {
              const selected =
                selection?.type === "layer" && selection.index === index;
              const range = layerRange({ layer, project });
              const region = regionStyle(range);
              return (
                <TimelineRow
                  key={index}
                  label={
                    <LaneLabel
                      selected={selected}
                      onClick={() => runtime.select({ type: "layer", index })}
                    >
                      <span>{layer.name ?? layer.type}</span>
                      <span className="text-xs text-muted-foreground">
                        {layer.type}
                      </span>
                    </LaneLabel>
                  }
                  graphStyle={graphStyle}
                >
                  {region && (
                    <button
                      type="button"
                      aria-label={`Select ${layer.name ?? layer.type} region`}
                      title={`${range.start.toFixed(3)}–${range.end.toFixed(3)} s`}
                      onClick={() => runtime.select({ type: "layer", index })}
                      data-testid={`timeline-layer-${index}`}
                      className={cn(
                        "absolute inset-y-1 overflow-hidden rounded border px-2 text-left text-xs",
                        layer.type === "audio"
                          ? "border-emerald-800 bg-emerald-950"
                          : "border-blue-800 bg-blue-950",
                        selected && "outline outline-1 outline-primary",
                      )}
                      style={region}
                    >
                      {layer.name ?? layer.type}
                      {(layer.type === "video" || layer.type === "audio") &&
                        layer.muted &&
                        " · muted"}
                    </button>
                  )}
                </TimelineRow>
              );
            })}
          {playhead >= visible.start && playhead <= visible.end && (
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

function TimelineRow({
  label,
  graphStyle,
  children,
}: {
  label: ReactNode;
  graphStyle: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className="flex h-8 border-b border-border/50">
      <div
        className="sticky left-0 z-20 flex shrink-0 items-center border-r bg-background"
        style={{ width: TIMELINE_LABEL_WIDTH }}
      >
        {label}
      </div>
      <div className="relative shrink-0 overflow-hidden" style={graphStyle}>
        {children}
      </div>
    </div>
  );
}

function LaneLabel({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-full w-full items-center justify-between gap-2 px-3 text-left hover:bg-secondary",
        selected && "bg-accent",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function rulerStep(pixelsPerSecond: number) {
  const target = 80 / pixelsPerSecond;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10]
    .map((factor) => factor * magnitude)
    .find((step) => step >= target)!;
}
