import { Trash2Icon } from "lucide-react";
import type {
  AudioLayer,
  Box,
  ColorLayer,
  Crop,
  ImageLayer,
  Layer,
  Project,
  TextLayer,
  VideoLayer,
} from "../lib/project";
import {
  getSelectedLayer,
  type EditorProject,
  type EditorRuntime,
  type EditorSelection,
} from "../lib/runtime";
import { Button } from "./ui/button";
import { useDraftInput } from "./use-draft-input";

export function Inspector({
  runtime,
  project,
  selection,
}: {
  runtime: EditorRuntime;
  project: EditorProject;
  selection?: EditorSelection;
}) {
  if (!selection) {
    return (
      <>
        <InspectorTitle />
        <p className="p-3 text-xs text-neutral-500">
          Select composition settings or a layer.
        </p>
      </>
    );
  }
  const time = getTimeFieldOptions(project.canvas.fps);
  switch (selection.type) {
    case "output": {
      return (
        <OutputInspector
          canvas={project.canvas}
          output={project.output}
          time={time}
          onCanvasCommit={(canvas) => runtime.setCanvas(canvas)}
          onOutputCommit={(output) => runtime.setOutput(output)}
          onOutputTypeChange={(type) => runtime.setOutputType(type)}
        />
      );
    }
    case "layer": {
      const layer = getSelectedLayer({ project, selection })!;
      return (
        <LayerInspector
          layer={layer}
          time={time}
          onUpdate={(update) => runtime.updateLayer({ id: layer.id, update })}
          onRemove={() => runtime.removeLayer(layer.id)}
        />
      );
    }
  }
}

type Canvas = Project["canvas"];

type Output = Project["output"];

type TimeFieldOptions = ReturnType<typeof getTimeFieldOptions>;

type LayerUpdate = (update: Partial<Layer>) => void;

/** Composition settings: the canvas together with what to render from it. */
function OutputInspector({
  canvas,
  output,
  time,
  onCanvasCommit,
  onOutputCommit,
  onOutputTypeChange,
}: {
  canvas: Canvas;
  output: Output;
  time: TimeFieldOptions;
  onCanvasCommit: (canvas: Canvas) => void;
  onOutputCommit: (output: Output) => void;
  onOutputTypeChange: (type: Output["type"]) => void;
}) {
  return (
    <div data-testid="inspector">
      <InspectorTitle title="Composition settings" subtitle={output.type} />
      <div className="flex flex-col gap-4 p-3">
        <Group title="Canvas">
          {(["width", "height"] as const).map((key) => (
            <NumberField
              key={key}
              label={key}
              value={canvas[key]}
              {...PIXEL_FIELD}
              min={1}
              onCommit={(value) => onCanvasCommit({ ...canvas, [key]: value })}
            />
          ))}
          <NumberField
            label="fps"
            value={canvas.fps}
            step={1}
            min={1}
            round={(value) => roundTo(value, 1e-3)}
            onCommit={(fps) => onCanvasCommit({ ...canvas, fps })}
          />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-neutral-400">background</span>
            <input
              type="color"
              aria-label="background"
              className="h-8 w-full min-w-0 cursor-pointer rounded border border-neutral-600 bg-neutral-900 px-1 outline-none focus-visible:border-ring"
              value={canvas.background ?? "#000000"}
              onChange={(e) =>
                onCanvasCommit({ ...canvas, background: e.target.value })
              }
            />
          </label>
        </Group>
        <Group title="Output">
          <div
            role="group"
            aria-label="Output type"
            className="col-span-2 grid grid-cols-2 gap-1"
          >
            {(["video", "still"] as const).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={output.type === type}
                onClick={() => onOutputTypeChange(type)}
                className="h-8 rounded border border-neutral-600 bg-neutral-900 text-xs text-neutral-400 outline-none hover:bg-neutral-800 focus-visible:border-ring aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
              >
                {type}
              </button>
            ))}
          </div>
          {output.type === "video" ? (
            <>
              <NumberField
                label="start"
                value={output.start}
                {...time}
                onCommit={(start) => onOutputCommit({ ...output, start })}
              />
              <NumberField
                label="end"
                value={output.end}
                {...time}
                onCommit={(end) => onOutputCommit({ ...output, end })}
              />
            </>
          ) : (
            <NumberField
              label="time"
              value={output.time}
              {...time}
              onCommit={(time) => onOutputCommit({ ...output, time })}
            />
          )}
        </Group>
      </div>
    </div>
  );
}

function LayerInspector({
  layer,
  time,
  onUpdate,
  onRemove,
}: {
  layer: Layer;
  time: TimeFieldOptions;
  onUpdate: LayerUpdate;
  onRemove: () => void;
}) {
  return (
    <div data-testid="inspector">
      <InspectorTitle
        title={layer.name ?? layer.type}
        subtitle={layer.type}
        onRemove={onRemove}
      />
      <div className="flex flex-col gap-4 p-3">
        <LayerFields layer={layer} time={time} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

/** Lists each layer type's groups in display order. */
function LayerFields({
  layer,
  time,
  onUpdate,
}: {
  layer: Layer;
  time: TimeFieldOptions;
  onUpdate: LayerUpdate;
}) {
  switch (layer.type) {
    case "video": {
      return (
        <>
          <SourceTimingFields layer={layer} time={time} onUpdate={onUpdate} />
          <AudioFields layer={layer} time={time} onUpdate={onUpdate} />
          <BoxFields box={layer.box} onCommit={(box) => onUpdate({ box })} />
          <CropFields
            crop={layer.crop}
            onCommit={(crop) => onUpdate({ crop })}
          />
        </>
      );
    }
    case "audio": {
      return (
        <>
          <SourceTimingFields layer={layer} time={time} onUpdate={onUpdate} />
          <AudioFields layer={layer} time={time} onUpdate={onUpdate} />
        </>
      );
    }
    case "image": {
      return (
        <>
          <RangeTimingFields layer={layer} time={time} onUpdate={onUpdate} />
          <BoxFields box={layer.box} onCommit={(box) => onUpdate({ box })} />
          <CropFields
            crop={layer.crop}
            onCommit={(crop) => onUpdate({ crop })}
          />
        </>
      );
    }
    case "text": {
      return (
        <>
          <RangeTimingFields layer={layer} time={time} onUpdate={onUpdate} />
          <Group title="Box">
            {(["x", "y", "width"] as const).map((key) => (
              <NumberField
                key={key}
                label={key}
                value={layer.box[key]}
                {...PIXEL_FIELD}
                onCommit={(value) =>
                  onUpdate({ box: { ...layer.box, [key]: value } })
                }
              />
            ))}
          </Group>
        </>
      );
    }
    case "color": {
      return (
        <>
          <RangeTimingFields layer={layer} time={time} onUpdate={onUpdate} />
          <Group title="Fill">
            <NumberField
              label="opacity"
              value={layer.opacity ?? 1}
              step={0.01}
              min={0}
              max={1}
              round={(value) => roundTo(value, 1e-3)}
              onCommit={(opacity) =>
                onUpdate({ opacity: opacity === 1 ? undefined : opacity })
              }
            />
          </Group>
          {layer.box && (
            <BoxFields box={layer.box} onCommit={(box) => onUpdate({ box })} />
          )}
        </>
      );
    }
  }
}

/** Timing for layers that play a source range: timeline start plus source in and out. */
function SourceTimingFields({
  layer,
  time,
  onUpdate,
}: {
  layer: VideoLayer | AudioLayer;
  time: TimeFieldOptions;
  onUpdate: LayerUpdate;
}) {
  return (
    <Group title="Timing">
      <NumberField
        label="start"
        value={layer.start}
        {...time}
        onCommit={(start) => onUpdate({ start })}
      />
      <NumberField
        label="in"
        value={layer.in}
        {...time}
        onCommit={(value) => onUpdate({ in: value })}
      />
      <NumberField
        label="out"
        value={layer.out}
        {...time}
        onCommit={(out) => onUpdate({ out })}
      />
    </Group>
  );
}

/** Timing for layers without a source range, which span start to end. */
function RangeTimingFields({
  layer,
  time,
  onUpdate,
}: {
  layer: ImageLayer | TextLayer | ColorLayer;
  time: TimeFieldOptions;
  onUpdate: LayerUpdate;
}) {
  return (
    <Group title="Timing">
      <NumberField
        label="start"
        value={layer.start}
        {...time}
        onCommit={(start) => onUpdate({ start })}
      />
      <NumberField
        label="end"
        value={layer.end}
        {...time}
        onCommit={(end) => onUpdate({ end })}
      />
    </Group>
  );
}

function AudioFields({
  layer,
  time,
  onUpdate,
}: {
  layer: VideoLayer | AudioLayer;
  time: TimeFieldOptions;
  onUpdate: LayerUpdate;
}) {
  return (
    <Group title="Audio">
      <label className="col-span-2 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={layer.muted ?? false}
          onChange={(e) => onUpdate({ muted: e.target.checked || undefined })}
        />
        muted
      </label>
      <NumberField
        label="fade in"
        value={layer.fadeIn ?? 0}
        {...time}
        onCommit={(fadeIn) => onUpdate({ fadeIn: fadeIn || undefined })}
      />
      <NumberField
        label="fade out"
        value={layer.fadeOut ?? 0}
        {...time}
        onCommit={(fadeOut) => onUpdate({ fadeOut: fadeOut || undefined })}
      />
    </Group>
  );
}

function BoxFields({
  box,
  onCommit,
}: {
  box: Box;
  onCommit: (box: Box) => void;
}) {
  return (
    <Group title="Box">
      {(["x", "y", "width", "height"] as const).map((key) => (
        <NumberField
          key={key}
          label={key}
          value={box[key]}
          {...PIXEL_FIELD}
          onCommit={(value) => onCommit({ ...box, [key]: value })}
        />
      ))}
    </Group>
  );
}

function CropFields({
  crop = {},
  onCommit,
}: {
  crop?: Crop;
  onCommit: (crop: Crop | undefined) => void;
}) {
  return (
    <Group title="Crop">
      {(["left", "right", "top", "bottom"] as const).map((key) => (
        <NumberField
          key={key}
          label={key}
          value={crop[key] ?? 0}
          step={0.001}
          min={0}
          max={1}
          round={(value) => roundTo(value, 1e-7)}
          onCommit={(value) => {
            const next = { ...crop, [key]: value || undefined };
            const empty = Object.values(next).every((v) => v === undefined);
            onCommit(empty ? undefined : next);
          }}
        />
      ))}
    </Group>
  );
}

const PIXEL_FIELD = { step: 1, round: Math.round };

/**
 * Times snap to the project's frame grid and are stored in milliseconds, like
 * the rest of the format. Arrow keys step by one frame, and times never go
 * below 0.
 */
function getTimeFieldOptions(fps: number) {
  return {
    step: 1 / fps,
    min: 0,
    round: (value: number) => roundTo(Math.round(value * fps) / fps, 1e-3),
  };
}

function roundTo(value: number, unit: number) {
  return Number((Math.round(value / unit) * unit).toFixed(9));
}

function NumberField({
  label,
  value,
  step,
  min,
  max,
  round,
  onCommit,
}: {
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  round: (value: number) => number;
  onCommit: (value: number) => void;
}) {
  const input = useDraftInput({
    value,
    step,
    min,
    max,
    onCommit: (next) => onCommit(round(next)),
  });
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-neutral-400">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        className="h-8 w-full min-w-0 rounded border border-neutral-600 bg-neutral-900 px-2 font-mono text-sm tabular-nums outline-none focus-visible:border-ring"
        {...input.props}
      />
    </label>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

/** Keeps the panel name fixed, with the selection after it like the Source band's file. */
function InspectorTitle({
  title,
  subtitle,
  onRemove,
}: {
  title?: string;
  subtitle?: string;
  /** Shows a remove button for the selected layer. */
  onRemove?: () => void;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-3 text-xs">
      <h2 className="shrink-0 font-semibold">Inspector</h2>
      {title && (
        <h3 className="truncate text-neutral-300" title={title}>
          {title}
        </h3>
      )}
      {subtitle && (
        <span className="shrink-0 text-[10px] text-neutral-400">
          {subtitle}
        </span>
      )}
      {onRemove && (
        <Button
          aria-label="Remove layer"
          title="Remove layer (Delete)"
          className="ml-auto size-5 shrink-0 text-neutral-400 hover:bg-neutral-700 hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
