import { useRef, useState, type ReactNode } from "react";
import { usePointerDrag } from "../hooks/use-pointer-drag";
import type { Layer } from "../lib/project";
import { MediaPreview } from "./media-preview";

export function PreviewMonitors({
  layer,
  composition,
  resolveMediaUrl,
}: {
  layer?: Layer;
  composition: ReactNode;
  resolveMediaUrl: (src: string) => string;
}) {
  const [sourceOpen, setSourceOpen] = useState(true);
  const [sourceShare, setSourceShare] = useState(35);
  const monitorsRef = useRef<HTMLDivElement>(null);
  const resize = (share: number) =>
    setSourceShare(Math.max(20, Math.min(60, share)));
  const dividerRef = usePointerDrag({
    onStart: (event) => {
      (event.currentTarget as HTMLElement).focus();
      return { share: sourceShare, width: monitorsRef.current!.clientWidth };
    },
    onMove: ({ data, deltaX }) =>
      resize(data.share + (deltaX / data.width) * 100),
  });
  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-2 p-3"
      aria-label="Preview monitors"
    >
      <div>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs hover:bg-secondary"
          aria-controls="source-monitor"
          aria-expanded={sourceOpen}
          onClick={() => setSourceOpen(!sourceOpen)}
        >
          {sourceOpen ? "Close source panel" : "Open source panel"}
        </button>
      </div>
      <div ref={monitorsRef} className="flex min-h-0 flex-1 gap-2">
        {sourceOpen && (
          <div
            id="source-monitor"
            className="min-w-0 shrink-0"
            style={{ width: `calc(${sourceShare}% - 8px)` }}
          >
            <MediaPreview
              key={
                layer && "src" in layer ? `${layer.type}:${layer.src}` : "none"
              }
              layer={layer}
              resolveMediaUrl={resolveMediaUrl}
            />
          </div>
        )}
        {sourceOpen && (
          <div
            ref={dividerRef}
            role="separator"
            tabIndex={0}
            aria-label="Source and composition split"
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={60}
            aria-valuenow={Math.round(sourceShare)}
            className="relative w-2 shrink-0 touch-none cursor-col-resize rounded bg-border/40 hover:bg-accent focus-visible:bg-accent"
            onKeyDown={(event) => {
              const share = {
                ArrowLeft: sourceShare - 2,
                ArrowRight: sourceShare + 2,
                Home: 20,
                End: 60,
              }[event.key];
              if (share !== undefined) {
                event.preventDefault();
                resize(share);
              }
            }}
          >
            <div className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded bg-muted-foreground/50" />
          </div>
        )}
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          aria-label="Composition monitor"
        >
          <h2 className="mb-2 text-sm font-medium">Composition</h2>
          {composition}
        </section>
      </div>
    </section>
  );
}
