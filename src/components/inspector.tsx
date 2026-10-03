import { useEffect, useState } from "react";
import { matchKeyboardEvent } from "../lib/keyboard";
import { rescaleMedia } from "../lib/layout";
import type {
  Canvas,
  AudioLayer,
  Box,
  ColorLayer,
  Crop,
  ImageLayer,
  Layer,
  MediaInfo,
  Output,
  TextLayer,
  Transform,
  VideoLayer,
} from "../lib/project";
import type { EditorRuntime, EditorProject } from "../lib/runtime";
import { cn } from "./ui/utils";
import { useDraftInput } from "./use-draft-input";
import type { EditorSelection } from "./use-layer-interaction";

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
      const { id } = selection;
      const index = project.layers.findIndex((layer) => layer.id === id);
      const layer = project.layers[index]!;
      return (
        <LayerInspector
          layer={layer}
          media={project.media}
          time={time}
          onUpdate={(update) => runtime.updateLayer({ id, update })}
          move={{
            canMoveUp: index < project.layers.length - 1,
            canMoveDown: index > 0,
            onMove: (direction) => runtime.moveLayer({ id, direction }),
          }}
        />
      );
    }
  }
}

type LayerUpdate = (update: Partial<Layer>) => void;

interface LayerMoveControls {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down") => void;
}

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
  media,
  time,
  onUpdate,
  move,
}: {
  layer: Layer;
  media: Record<string, MediaInfo>;
  time: TimeFieldOptions;
  onUpdate: LayerUpdate;
  move: LayerMoveControls;
}) {
  return (
    <div data-testid="inspector">
      <InspectorTitle title={layer.name ?? layer.type} subtitle={layer.type} />
      <div className="flex flex-col gap-4 p-3">
        {/* An empty name removes it, so the layer reads as its type again. */}
        <TextField
          label="name"
          value={layer.name ?? ""}
          onCommit={(name) => onUpdate({ name: name || undefined })}
        />
        <Group title="Stack">
          {(["up", "down"] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              disabled={
                direction === "up" ? !move.canMoveUp : !move.canMoveDown
              }
              onClick={() => move.onMove(direction)}
              className="h-8 rounded border border-neutral-600 bg-neutral-900 text-xs text-neutral-400 outline-none hover:bg-neutral-800 focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50"
            >
              Move {direction}
            </button>
          ))}
        </Group>
        <LayerFields
          layer={layer}
          media={media}
          time={time}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}

/** Lists each layer type's groups in display order. */
function LayerFields({
  layer,
  media,
  time,
  onUpdate,
}: {
  layer: Layer;
  media: Record<string, MediaInfo>;
  time: TimeFieldOptions;
  onUpdate: LayerUpdate;
}) {
  switch (layer.type) {
    case "video": {
      return (
        <>
          <SourceTimingFields layer={layer} time={time} onUpdate={onUpdate} />
          <HoldFields layer={layer} time={time} onUpdate={onUpdate} />
          <AudioFields layer={layer} time={time} onUpdate={onUpdate} />
          <TransformFields
            transform={layer.transform}
            source={media[layer.src].video!}
            onCommit={(transform) => onUpdate({ transform })}
          />
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
          <TransformFields
            transform={layer.transform}
            source={media[layer.src].video!}
            onCommit={(transform) => onUpdate({ transform })}
          />
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
          <TextFields layer={layer} onUpdate={onUpdate} />
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
            <ColorField
              label="color"
              value={layer.color}
              onCommit={(color) => onUpdate({ color })}
            />
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
          <BoxFields box={layer.box} onCommit={(box) => onUpdate({ box })} />
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

/** Seconds to hold the first and last frames beyond the source range. */
function HoldFields({
  layer,
  time,
  onUpdate,
}: {
  layer: VideoLayer;
  time: TimeFieldOptions;
  onUpdate: LayerUpdate;
}) {
  const commit = (key: "before" | "after", value: number) => {
    const hold = { ...layer.hold, [key]: value || undefined };
    onUpdate({
      hold: hold.before || hold.after ? hold : undefined,
    });
  };
  return (
    <Group title="Hold">
      <NumberField
        label="before"
        value={layer.hold?.before ?? 0}
        {...time}
        onCommit={(value) => commit("before", value)}
      />
      <NumberField
        label="after"
        value={layer.hold?.after ?? 0}
        {...time}
        onCommit={(value) => commit("after", value)}
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

function TextFields({
  layer,
  onUpdate,
}: {
  layer: TextLayer;
  onUpdate: LayerUpdate;
}) {
  const { font, outline } = layer;
  const align = layer.align ?? "left";
  return (
    <>
      <Group title="Text">
        <TextField
          label="text"
          value={layer.text}
          multiline
          onCommit={(text) => onUpdate({ text })}
        />
        <div
          role="group"
          aria-label="Text align"
          className="col-span-2 grid grid-cols-3 gap-1"
        >
          {(["left", "center", "right"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={align === value}
              onClick={() =>
                onUpdate({ align: value === "left" ? undefined : value })
              }
              className="h-8 rounded border border-neutral-600 bg-neutral-900 text-xs text-neutral-400 outline-none hover:bg-neutral-800 focus-visible:border-ring aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
            >
              {value}
            </button>
          ))}
        </div>
        <ColorField
          label="color"
          value={layer.color}
          onCommit={(color) => onUpdate({ color })}
        />
      </Group>
      <Group title="Font">
        <TextField
          label="family"
          value={font.family}
          onCommit={(family) => onUpdate({ font: { ...font, family } })}
        />
        <NumberField
          label="size"
          value={font.size}
          {...PIXEL_FIELD}
          min={1}
          onCommit={(size) => onUpdate({ font: { ...font, size } })}
        />
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-neutral-400">weight</span>
          {/* The renderer maps only these weights to font faces. */}
          <select
            aria-label="weight"
            className="h-8 w-full min-w-0 rounded border border-neutral-600 bg-neutral-900 px-1 text-sm outline-none focus-visible:border-ring"
            value={font.weight ?? 400}
            onChange={(e) => {
              const weight = Number(e.target.value);
              onUpdate({
                font: { ...font, weight: weight === 400 ? undefined : weight },
              });
            }}
          >
            {[300, 400, 500, 700, 900].map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="line spacing"
          value={font.lineSpacing ?? 0}
          {...PIXEL_FIELD}
          onCommit={(lineSpacing) =>
            onUpdate({
              font: { ...font, lineSpacing: lineSpacing || undefined },
            })
          }
        />
      </Group>
      <Group title="Outline">
        <NumberField
          label="outline width"
          value={outline?.width ?? 0}
          step={1}
          min={0}
          round={(value) => roundTo(value, 0.1)}
          onCommit={(width) =>
            onUpdate({
              outline: width
                ? { color: outline?.color ?? "#000000", width }
                : undefined,
            })
          }
        />
        {/* A color without a width would draw nothing, so it waits for a width. */}
        <ColorField
          label="outline color"
          value={outline?.color ?? "#000000"}
          disabled={!outline}
          onCommit={(color) => {
            if (outline) {
              onUpdate({ outline: { ...outline, color } });
            }
          }}
        />
      </Group>
    </>
  );
}

/**
 * Position and size describe the whole scaled source, before the crop hides
 * its edges. Scale, width, and height are linked views of the one stored
 * scale, and editing any of them keeps the source centered where it was.
 */
function TransformFields({
  transform,
  source,
  onCommit,
}: {
  transform: Transform;
  source: { width: number; height: number };
  onCommit: (transform: Transform) => void;
}) {
  const commitScale = (scale: number) =>
    onCommit(rescaleMedia({ source, transform, scale: roundTo(scale, 1e-6) }));
  return (
    <Group title="Transform">
      {(["x", "y"] as const).map((key) => (
        <NumberField
          key={key}
          label={key}
          value={transform[key]}
          {...PIXEL_FIELD}
          onCommit={(value) => onCommit({ ...transform, [key]: value })}
        />
      ))}
      <NumberField
        label="scale %"
        value={roundTo(transform.scale * 100, 0.01)}
        step={1}
        min={1}
        round={(value) => roundTo(value, 0.01)}
        onCommit={(percent) => commitScale(percent / 100)}
      />
      <div />
      {(["width", "height"] as const).map((key) => (
        <NumberField
          key={key}
          label={key}
          value={Math.round(source[key] * transform.scale)}
          {...PIXEL_FIELD}
          min={1}
          onCommit={(size) => commitScale(size / source[key])}
        />
      ))}
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

interface TimeFieldOptions {
  step: number;
  min: number;
  round: (value: number) => number;
}

/**
 * Times snap to the project's frame grid and are stored in milliseconds, like
 * the rest of the format. Arrow keys step by one frame, and times never go
 * below 0.
 */
function getTimeFieldOptions(fps: number): TimeFieldOptions {
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

/**
 * Commits on blur or Enter like NumberField. A multiline field keeps Enter for
 * line breaks, so it commits only on blur.
 */
function TextField({
  label,
  value,
  multiline,
  onCommit,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const props = {
    "aria-label": label,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onKeyDown: (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (matchKeyboardEvent(e, "Escape")) {
        setDraft(value);
        e.currentTarget.blur();
      } else if (!multiline && matchKeyboardEvent(e, "Enter")) {
        e.currentTarget.blur();
      }
    },
    onBlur: () => {
      if (draft !== value) {
        onCommit(draft);
      }
    },
  };
  return (
    <label className={cn("flex flex-col gap-1", multiline && "col-span-2")}>
      <span className="text-[10px] text-neutral-400">{label}</span>
      {multiline ? (
        <textarea
          rows={3}
          className="w-full min-w-0 resize-y rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm outline-none focus-visible:border-ring"
          {...props}
        />
      ) : (
        <input
          type="text"
          className="h-8 w-full min-w-0 rounded border border-neutral-600 bg-neutral-900 px-2 text-sm outline-none focus-visible:border-ring"
          {...props}
        />
      )}
    </label>
  );
}

function ColorField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-neutral-400">{label}</span>
      <input
        type="color"
        aria-label={label}
        disabled={disabled}
        className="h-8 w-full min-w-0 cursor-pointer rounded border border-neutral-600 bg-neutral-900 px-1 outline-none focus-visible:border-ring disabled:cursor-default disabled:opacity-50"
        value={value}
        onChange={(e) => onCommit(e.target.value)}
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
}: {
  title?: string;
  subtitle?: string;
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
    </div>
  );
}
