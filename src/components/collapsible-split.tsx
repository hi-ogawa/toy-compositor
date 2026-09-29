import { useRef, useState, type ReactNode } from "react";
import { usePointerDrag } from "../hooks/use-pointer-drag";

/**
 * A resizable side panel beside a main panel. Closing the side leaves `strip`
 * at the same edge, so reopening stays where the panel was.
 */
export function CollapsibleSplit({
  open,
  sideId,
  sideLabel,
  side,
  strip,
  main,
}: {
  open: boolean;
  sideId: string;
  sideLabel: string;
  side: ReactNode;
  strip: ReactNode;
  main: ReactNode;
}) {
  const [sideShare, setSideShare] = useState(35);
  const containerRef = useRef<HTMLDivElement>(null);
  const resize = (share: number) =>
    setSideShare(Math.max(20, Math.min(60, share)));
  const dividerRef = usePointerDrag({
    onStart: () => ({
      share: sideShare,
      width: containerRef.current!.clientWidth,
    }),
    onMove: ({ data, deltaX }) =>
      resize(data.share + (deltaX / data.width) * 100),
  });
  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      {open ? (
        <>
          <div
            id={sideId}
            className="flex min-w-0 shrink-0 flex-col"
            style={{ width: `${sideShare}%` }}
          >
            {side}
          </div>
          <div
            ref={dividerRef}
            title={`Resize ${sideLabel}`}
            className="relative z-10 w-px shrink-0 touch-none cursor-col-resize bg-neutral-700 after:absolute after:inset-y-0 after:-left-1 after:w-2 hover:bg-neutral-500"
          />
        </>
      ) : (
        <div className="flex w-9 shrink-0 flex-col items-center border-r border-neutral-700 bg-neutral-800 py-1">
          {strip}
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{main}</div>
    </div>
  );
}
