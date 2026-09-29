import { useRef, useState, type ReactNode } from "react";
import { usePointerDrag } from "../hooks/use-pointer-drag";
import type { Layer } from "../lib/project";
import { MediaPreview } from "./media-preview";

export function PreviewMonitors({
  sourceOpen,
  layer,
  composition,
  resolveMediaUrl,
}: {
  sourceOpen: boolean;
  layer?: Layer;
  composition: ReactNode;
  resolveMediaUrl: (src: string) => string;
}) {
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
      {sourceOpen && (
        <div
          id="source-monitor"
          className="flex min-w-0 shrink-0 flex-col"
          style={{ width: `${sourceShare}%` }}
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
