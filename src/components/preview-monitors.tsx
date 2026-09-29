import { MonitorPlayIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { usePointerDrag } from "../hooks/use-pointer-drag";
import type { Layer } from "../lib/project";
import { MediaPreview } from "./media-preview";
import { Button } from "./ui/button";

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
  const monitorsRef = useRef<HTMLElement>(null);
  const resize = (share: number) =>
    setSourceShare(Math.max(20, Math.min(60, share)));
  const dividerRef = usePointerDrag({
    onStart: () => ({
      share: sourceShare,
      width: monitorsRef.current!.clientWidth,
    }),
    onMove: ({ data, deltaX }) =>
      resize(data.share + (deltaX / data.width) * 100),
  });
  return (
    <section
      ref={monitorsRef}
      className="flex min-h-0 flex-1"
      aria-label="Preview monitors"
    >
      {/* Collapses to a strip at the same edge, so reopening stays where the panel was. */}
      {!sourceOpen && (
        <div className="flex w-9 shrink-0 flex-col items-center border-r border-neutral-700 bg-neutral-800 py-1">
          <Button
            aria-label="Expand source panel"
            title="Source"
            aria-expanded={false}
            className="size-7 text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
            onClick={() => setSourceOpen(true)}
          >
            <MonitorPlayIcon className="size-4" />
          </Button>
        </div>
      )}
      {sourceOpen && (
        <div
          id="source-monitor"
          className="flex min-w-0 shrink-0 flex-col"
          style={{ width: `${sourceShare}%` }}
        >
          <MediaPreview
            layer={layer}
            resolveMediaUrl={resolveMediaUrl}
            onCollapse={() => setSourceOpen(false)}
          />
        </div>
      )}
      {sourceOpen && (
        <div
          ref={dividerRef}
          title="Resize source panel"
          className="relative z-10 w-px shrink-0 touch-none cursor-col-resize bg-neutral-700 after:absolute after:inset-y-0 after:-left-1 after:w-2 hover:bg-neutral-500"
        />
      )}
      <section
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        aria-label="Composition monitor"
      >
        {composition}
      </section>
    </section>
  );
}
