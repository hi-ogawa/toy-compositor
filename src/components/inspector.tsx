import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiClient } from "../lib/api-client";
import { matchKeyboardEvent } from "../lib/keyboard";
import { getRescaledTransform } from "../lib/layout";
import type {
  Canvas,
  AudioClip,
  Box,
  Clip,
  ColorClip,
  Crop,
  ImageClip,
  Layer,
  MediaInfo,
  Output,
  Size,
  TextClip,
  Transform,
  VideoClip,
} from "../lib/project";
import {
  findClip,
  type EditorRuntime,
  type EditorProject,
} from "../lib/runtime";
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
      const layerIndex = project.layers.findIndex((layer) => layer.id === id);
      return (
        <LayerInspector
          layer={project.layers[layerIndex]!}
          onUpdate={(update) => runtime.updateLayer({ id, update })}
          move={{
            canMoveUp: layerIndex < project.layers.length - 1,
            canMoveDown: layerIndex > 0,
            onMove: (direction) => runtime.moveLayer({ id, direction }),
          }}
        />
      );
    }
    case "clip": {
      const { id } = selection;
      const { layer, clip } = findClip(project.layers, id)!;
      return (
        <ClipInspector
          layerName={layer.name}
          clip={clip}
          media={project.media}
          time={time}
          onUpdate={(update) => runtime.updateClip({ id, update })}
        />
      );
    }
  }
}

type LayerUpdate = (update: Partial<Omit<Layer, "clips">>) => void;

type ClipUpdate = (update: Partial<Clip>) => void;

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
          {/* Video output needs an even canvas (see renderProject),
              so arrow keys step by two. */}
          {(["width", "height"] as const).map((key) => (
            <NumberField
              key={key}
              label={key}
              value={canvas[key]}
              {...PIXEL_FIELD}
              step={2}
              min={2}
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
              value={canvas.background}
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

/** A layer's own fields, which apply to every clip on it. */
function LayerInspector({
  layer,
  onUpdate,
  move,
}: {
  layer: Omit<Layer, "clips">;
  onUpdate: LayerUpdate;
  move: LayerMoveControls;
}) {
  return (
    <div data-testid="inspector">
      <InspectorTitle title={layer.name} subtitle="layer" />
      <div className="flex flex-col gap-4 p-3">
        <TextField
          label="name"
          value={layer.name}
          onCommit={(name) => onUpdate({ name })}
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
        <Group title="Picture">
          <label className="col-span-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={layer.hidden}
              onChange={(e) => onUpdate({ hidden: e.target.checked })}
            />
            hidden
          </label>
        </Group>
        <Group title="Audio">
          <label className="col-span-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={layer.muted}
              onChange={(e) => onUpdate({ muted: e.target.checked })}
            />
            muted
          </label>
        </Group>
      </div>
    </div>
  );
}

/** A clip's fields, titled by its layer's name. */
function ClipInspector({
  layerName,
  clip,
  media,
  time,
  onUpdate,
}: {
  layerName: string;
  clip: Clip;
  media: Record<string, MediaInfo>;
  time: TimeFieldOptions;
  onUpdate: ClipUpdate;
}) {
  return (
    <div data-testid="inspector">
      <InspectorTitle title={layerName} subtitle={clip.type} />
      <div className="flex flex-col gap-4 p-3">
        <ClipFields clip={clip} media={media} time={time} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function ClipFields({
  clip,
  media,
  time,
  onUpdate,
}: {
  clip: Clip;
  media: Record<string, MediaInfo>;
  time: TimeFieldOptions;
  onUpdate: ClipUpdate;
}) {
  switch (clip.type) {
    case "video": {
      return (
        <>
          <SourceTimingFields clip={clip} time={time} onUpdate={onUpdate} />
          <HoldFields clip={clip} time={time} onUpdate={onUpdate} />
          <AudioFields clip={clip} time={time} onUpdate={onUpdate} />
          <TransformFields
            transform={clip.transform}
            source={media[clip.src].video!}
            crop={clip.crop}
            onCommit={(transform) => onUpdate({ transform })}
          />
          <CropFields
            crop={clip.crop}
            onCommit={(crop) => onUpdate({ crop })}
          />
        </>
      );
    }
    case "audio": {
      return (
        <>
          <SourceTimingFields clip={clip} time={time} onUpdate={onUpdate} />
          <AudioFields clip={clip} time={time} onUpdate={onUpdate} />
        </>
      );
    }
    case "image": {
      return (
        <>
          <RangeTimingFields clip={clip} time={time} onUpdate={onUpdate} />
          <TransformFields
            transform={clip.transform}
            source={media[clip.src].video!}
            crop={clip.crop}
            onCommit={(transform) => onUpdate({ transform })}
          />
          <CropFields
            crop={clip.crop}
            onCommit={(crop) => onUpdate({ crop })}
          />
        </>
      );
    }
    case "text": {
      return (
        <>
          <RangeTimingFields clip={clip} time={time} onUpdate={onUpdate} />
          <TextFields clip={clip} onUpdate={onUpdate} />
          <BoxFields box={clip.box} onCommit={(box) => onUpdate({ box })}>
            <FitTextHeightButton clip={clip} onUpdate={onUpdate} />
          </BoxFields>
        </>
      );
    }
    case "color": {
      return (
        <>
          <RangeTimingFields clip={clip} time={time} onUpdate={onUpdate} />
          <Group title="Fill">
            <ColorField
              label="color"
              value={clip.color}
              onCommit={(color) => onUpdate({ color })}
            />
            <NumberField
              label="opacity"
              value={clip.opacity}
              step={0.01}
              min={0}
              max={1}
              round={(value) => roundTo(value, 1e-3)}
              onCommit={(opacity) => onUpdate({ opacity })}
            />
          </Group>
          <BoxFields box={clip.box} onCommit={(box) => onUpdate({ box })} />
        </>
      );
    }
  }
}

/** Timing for clips that play a source range: timeline start plus source in and out. */
function SourceTimingFields({
  clip,
  time,
  onUpdate,
}: {
  clip: VideoClip | AudioClip;
  time: TimeFieldOptions;
  onUpdate: ClipUpdate;
}) {
  return (
    <Group title="Timing">
      <NumberField
        label="start"
        value={clip.start}
        {...time}
        onCommit={(start) => onUpdate({ start })}
      />
      <NumberField
        label="in"
        value={clip.in}
        {...time}
        onCommit={(value) => onUpdate({ in: value })}
      />
      <NumberField
        label="out"
        value={clip.out}
        {...time}
        onCommit={(out) => onUpdate({ out })}
      />
    </Group>
  );
}

/** Seconds to hold the first and last frames beyond the source range. */
function HoldFields({
  clip,
  time,
  onUpdate,
}: {
  clip: VideoClip;
  time: TimeFieldOptions;
  onUpdate: ClipUpdate;
}) {
  return (
    <Group title="Hold">
      <NumberField
        label="before"
        value={clip.hold.before}
        {...time}
        onCommit={(before) => onUpdate({ hold: { ...clip.hold, before } })}
      />
      <NumberField
        label="after"
        value={clip.hold.after}
        {...time}
        onCommit={(after) => onUpdate({ hold: { ...clip.hold, after } })}
      />
    </Group>
  );
}

/** Timing for clips without a source range, which span start to end. */
function RangeTimingFields({
  clip,
  time,
  onUpdate,
}: {
  clip: ImageClip | TextClip | ColorClip;
  time: TimeFieldOptions;
  onUpdate: ClipUpdate;
}) {
  return (
    <Group title="Timing">
      <NumberField
        label="start"
        value={clip.start}
        {...time}
        onCommit={(start) => onUpdate({ start })}
      />
      <NumberField
        label="end"
        value={clip.end}
        {...time}
        onCommit={(end) => onUpdate({ end })}
      />
    </Group>
  );
}

function AudioFields({
  clip,
  time,
  onUpdate,
}: {
  clip: VideoClip | AudioClip;
  time: TimeFieldOptions;
  onUpdate: ClipUpdate;
}) {
  return (
    <Group title="Audio">
      <NumberField
        label="fade in"
        value={clip.fadeIn}
        {...time}
        onCommit={(fadeIn) => onUpdate({ fadeIn })}
      />
      <NumberField
        label="fade out"
        value={clip.fadeOut}
        {...time}
        onCommit={(fadeOut) => onUpdate({ fadeOut })}
      />
    </Group>
  );
}

function TextFields({
  clip,
  onUpdate,
}: {
  clip: TextClip;
  onUpdate: ClipUpdate;
}) {
  const { align, font, outline } = clip;
  return (
    <>
      <Group title="Text">
        <TextField
          label="text"
          value={clip.text}
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
              onClick={() => onUpdate({ align: value })}
              className="h-8 rounded border border-neutral-600 bg-neutral-900 text-xs text-neutral-400 outline-none hover:bg-neutral-800 focus-visible:border-ring aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
            >
              {value}
            </button>
          ))}
        </div>
        <ColorField
          label="color"
          value={clip.color}
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
            value={font.weight}
            onChange={(e) =>
              onUpdate({ font: { ...font, weight: Number(e.target.value) } })
            }
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
          value={font.lineSpacing}
          {...PIXEL_FIELD}
          onCommit={(lineSpacing) =>
            onUpdate({ font: { ...font, lineSpacing } })
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
 * scale, and editing any of them keeps what the crop leaves centered where it
 * was.
 */
function TransformFields({
  transform,
  source,
  crop,
  onCommit,
}: {
  transform: Transform;
  source: Size;
  crop: Crop;
  onCommit: (transform: Transform) => void;
}) {
  const commitScale = (scale: number) =>
    onCommit(
      getRescaledTransform({
        size: source,
        crop,
        transform,
        scale: roundTo(scale, 1e-6),
      }),
    );
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
  children,
}: {
  box: Box;
  onCommit: (box: Box) => void;
  children?: React.ReactNode;
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
      {children}
    </Group>
  );
}

function FitTextHeightButton({
  clip,
  onUpdate,
}: {
  clip: TextClip;
  onUpdate: ClipUpdate;
}) {
  const fitMutation = useMutation({
    mutationFn: async () => {
      const height = await apiClient.measureTextHeight({ drawing: clip });
      onUpdate({ box: { ...clip.box, height } });
    },
  });
  return (
    <button
      type="button"
      disabled={fitMutation.isPending}
      onClick={() => fitMutation.mutate()}
      className="col-span-2 h-8 rounded border border-neutral-600 bg-neutral-900 text-xs text-neutral-400 outline-none hover:bg-neutral-800 focus-visible:border-ring disabled:opacity-50"
    >
      Fit height to text
    </button>
  );
}

function CropFields({
  crop,
  onCommit,
}: {
  crop: Crop;
  onCommit: (crop: Crop) => void;
}) {
  return (
    <Group title="Crop">
      {(["left", "right", "top", "bottom"] as const).map((key) => (
        <NumberField
          key={key}
          label={key}
          value={crop[key]}
          step={0.001}
          min={0}
          max={1}
          round={(value) => roundTo(value, 1e-7)}
          onCommit={(value) => onCommit({ ...crop, [key]: value })}
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
