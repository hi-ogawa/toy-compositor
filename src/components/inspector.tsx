import { useDraftInput } from "../hooks/use-draft-input";
import type { Box, Crop, Layer, Project } from "../lib/project";
import type { EditorRuntime, EditorSelection } from "../lib/runtime";

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
      <p className="p-3 text-sm text-muted-foreground">
        Select the output or a layer.
      </p>
    );
  }
  const time = timeField(project.canvas.fps);
  if (selection.type === "output") {
    const { output } = project;
    return (
      <div className="flex flex-col gap-4 p-3" data-testid="inspector">
        <InspectorTitle title="Output" subtitle={output.type} />
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
    );
  }
  const { index } = selection;
  const layer = project.layers[index];
  const update = (update: Partial<Layer>) =>
    runtime.updateLayer({ index, update });
  return (
    <div className="flex flex-col gap-4 p-3" data-testid="inspector">
      <InspectorTitle title={layer.name ?? layer.type} subtitle={layer.type} />
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
              min={0}
              onCommit={(value) => update({ in: value })}
            />
            <NumberField
              label="out"
              value={layer.out}
              {...time}
              min={0}
              onCommit={(out) => update({ out })}
            />
          </Group>
          <Group title="Audio">
            <label className="col-span-2 flex items-center gap-2 text-sm">
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
              min={0}
              onCommit={(fadeIn) => update({ fadeIn: fadeIn || undefined })}
            />
            <NumberField
              label="fade out"
              value={layer.fadeOut ?? 0}
              {...time}
              min={0}
              onCommit={(fadeOut) => update({ fadeOut: fadeOut || undefined })}
            />
          </Group>
        </>
      )}
      {(layer.type === "video" || layer.type === "image") && (
        <>
          <BoxFields box={layer.box} onCommit={(box) => update({ box })} />
          <CropFields crop={layer.crop} onCommit={(crop) => update({ crop })} />
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

// Times snap to the project's frame grid and are stored in milliseconds, like
// the rest of the format. Arrow keys step by one frame.
function timeField(fps: number) {
  return {
    step: 1 / fps,
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
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        className="w-full min-w-0 rounded-md border border-input bg-transparent px-2 py-1 font-mono tabular-nums outline-none focus-visible:border-ring"
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
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
  subtitle: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="font-medium">{title}</h2>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </div>
  );
}
