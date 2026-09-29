import type { Box, Crop, Layer, Project } from "../lib/project";
import type { EditorRuntime, EditorSelection } from "../lib/runtime";
import { useDraftInput } from "./use-draft-input";

export function Inspector({
  runtime,
  project,
  selection,
}: {
  runtime: EditorRuntime;
  project: Project;
  selection?: EditorSelection;
}) {
  if (!selection) {
    return (
      <>
        <InspectorTitle title="Inspector" />
        <p className="p-3 text-xs text-neutral-500">
          Select render settings or a layer.
        </p>
      </>
    );
  }
  const time = getTimeFieldOptions(project.canvas.fps);
  if (selection.type === "output") {
    const { output } = project;
    return (
      <div data-testid="inspector">
        <InspectorTitle title="Render settings" subtitle={output.type} />
        <div className="flex flex-col gap-4 p-3">
          <Group title="Range">
            {output.type === "video" ? (
              <>
                <NumberField
                  label="start"
                  value={output.start}
                  {...time}
                  onCommit={(start) => runtime.setOutput({ ...output, start })}
                />
                <NumberField
                  label="end"
                  value={output.end}
                  {...time}
                  onCommit={(end) => runtime.setOutput({ ...output, end })}
                />
              </>
            ) : (
              <NumberField
                label="time"
                value={output.time}
                {...time}
                onCommit={(time) => runtime.setOutput({ ...output, time })}
              />
            )}
          </Group>
        </div>
      </div>
    );
  }
  const { index } = selection;
  const layer = project.layers[index];
  const update = (update: Partial<Layer>) =>
    runtime.updateLayer({ index, update });
  return (
    <div data-testid="inspector">
      <InspectorTitle title={layer.name ?? layer.type} subtitle={layer.type} />
      <div className="flex flex-col gap-4 p-3">
        {(layer.type === "video" || layer.type === "audio") && (
          <>
            <Group title="Timing">
              <NumberField
                label="start"
                value={layer.start}
                {...time}
                onCommit={(start) => update({ start })}
              />
              <NumberField
                label="in"
                value={layer.in}
                {...time}
                onCommit={(value) => update({ in: value })}
              />
              <NumberField
                label="out"
                value={layer.out}
                {...time}
                onCommit={(out) => update({ out })}
              />
            </Group>
            <Group title="Audio">
              <label className="col-span-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={layer.muted ?? false}
                  onChange={(e) =>
                    update({ muted: e.target.checked || undefined })
                  }
                />
                muted
              </label>
              <NumberField
                label="fade in"
                value={layer.fadeIn ?? 0}
                {...time}
                onCommit={(fadeIn) => update({ fadeIn: fadeIn || undefined })}
              />
              <NumberField
                label="fade out"
                value={layer.fadeOut ?? 0}
                {...time}
                onCommit={(fadeOut) =>
                  update({ fadeOut: fadeOut || undefined })
                }
              />
            </Group>
          </>
        )}
        {(layer.type === "image" ||
          layer.type === "text" ||
          layer.type === "color") && (
          <Group title="Timing">
            <NumberField
              label="start"
              value={layer.start}
              {...time}
              onCommit={(start) => update({ start })}
            />
            <NumberField
              label="end"
              value={layer.end}
              {...time}
              onCommit={(end) => update({ end })}
            />
          </Group>
        )}
        {(layer.type === "video" || layer.type === "image") && (
          <>
            <BoxFields box={layer.box} onCommit={(box) => update({ box })} />
            <CropFields
              crop={layer.crop}
              onCommit={(crop) => update({ crop })}
            />
          </>
        )}
        {layer.type === "text" && (
          <Group title="Box">
            {(["x", "y", "width"] as const).map((key) => (
              <NumberField
                key={key}
                label={key}
                value={layer.box[key]}
                {...PIXEL_FIELD}
                onCommit={(value) =>
                  update({ box: { ...layer.box, [key]: value } })
                }
              />
            ))}
          </Group>
        )}
        {layer.type === "color" && (
          <>
            <Group title="Fill">
              <NumberField
                label="opacity"
                value={layer.opacity ?? 1}
                step={0.01}
                min={0}
                max={1}
                round={(value) => roundTo(value, 1e-3)}
                onCommit={(opacity) =>
                  update({ opacity: opacity === 1 ? undefined : opacity })
                }
              />
            </Group>
            {layer.box && (
              <BoxFields box={layer.box} onCommit={(box) => update({ box })} />
            )}
          </>
        )}
      </div>
    </div>
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

function InspectorTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-3 text-xs">
      <h2 className="shrink-0 font-semibold">{title}</h2>
      {subtitle && (
        <span className="text-[10px] text-neutral-400">{subtitle}</span>
      )}
    </div>
  );
}
