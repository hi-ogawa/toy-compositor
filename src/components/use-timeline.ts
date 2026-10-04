import { useCallback, useState } from "react";
import type { ProjectClientStorage } from "../lib/client-storage";
import { matchKeyboardEvent } from "../lib/keyboard";
import { intersect, type TimeRange } from "../lib/layout";
import type { EditorRuntime } from "../lib/runtime";
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  getRulerStep,
  getRulerSubdivisionStep,
} from "../lib/timeline";
import { useStorageState } from "./use-storage-state";

export const TIMELINE_LABEL_WIDTH = 176;

export type TimelineView = ReturnType<typeof useTimeline>;

/** A viewport over project time that every row maps through, scrolled and zoomed with the wheel. */
export function useTimeline({
  runtime,
  clientStorage,
}: {
  runtime: EditorRuntime;
  clientStorage: ProjectClientStorage;
}) {
  const [viewportStart, setViewportStart] = useStorageState(
    clientStorage,
    "viewportStart",
  );
  const [pixelsPerSecond, setPixelsPerSecond] = useStorageState(
    clientStorage,
    "pixelsPerSecond",
  );
  const [viewportWidth, setViewportWidth] = useState(0);
  const visible = {
    start: viewportStart,
    end: viewportStart + viewportWidth / pixelsPerSecond,
  };
  const timeToX = (time: number) => (time - viewportStart) * pixelsPerSecond;

  function zoom(nextPixelsPerSecond: number, anchorX: number) {
    const timeAtAnchor = viewportStart + anchorX / pixelsPerSecond;
    setPixelsPerSecond(nextPixelsPerSecond);
    setViewportStart(Math.max(0, timeAtAnchor - anchorX / nextPixelsPerSecond));
  }

  /** Steps the playhead by one frame with the arrow keys, ten with Shift, repeating while held. */
  function handleFrameStepShortcut(event: KeyboardEvent): boolean {
    for (const [shortcut, frames] of [
      ["ArrowLeft", -1],
      ["ArrowRight", 1],
      ["Shift+ArrowLeft", -10],
      ["Shift+ArrowRight", 10],
    ] as const) {
      if (matchKeyboardEvent(event, shortcut)) {
        runtime.seekFrames(frames);
        return true;
      }
    }
    return false;
  }

  const viewportRef = useCallback(
    (viewport: HTMLDivElement | null) => {
      if (!viewport) {
        return;
      }
      const observer = new ResizeObserver(([entry]) => {
        setViewportWidth(entry.contentRect.width);
      });
      observer.observe(viewport);
      const wheelTarget = viewport.parentElement;
      const handleWheel = (event: WheelEvent) => {
        const rect = viewport.getBoundingClientRect();
        if (event.clientX < rect.left) {
          return;
        }
        event.preventDefault();
        if (!event.ctrlKey) {
          const delta = event.deltaX || event.deltaY;
          setViewportStart((value) =>
            Math.max(0, value + delta / pixelsPerSecond),
          );
          return;
        }
        if (event.deltaY === 0) {
          return;
        }
        const nextPixelsPerSecond = Math.max(
          MIN_PIXELS_PER_SECOND,
          Math.min(
            MAX_PIXELS_PER_SECOND,
            pixelsPerSecond * (event.deltaY > 0 ? 0.9 : 1.1),
          ),
        );
        zoom(nextPixelsPerSecond, Math.max(0, event.clientX - rect.left));
      };
      wheelTarget?.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        observer.disconnect();
        wheelTarget?.removeEventListener("wheel", handleWheel);
      };
    },
    [pixelsPerSecond, viewportStart],
  );

  const tickStep = getRulerStep(pixelsPerSecond);

  return {
    pixelsPerSecond,
    tickStep,
    subdivisionStep: getRulerSubdivisionStep(tickStep),
    visible,
    viewportRef,
    handleFrameStepShortcut,
    timeToX,
    xToTime: (x: number) => viewportStart + x / pixelsPerSecond,
    isVisible: (time: number) => time >= visible.start && time <= visible.end,
    /** Position a range within the graph, or nothing when it is outside the viewport. */
    rangeStyle: (range: TimeRange) => {
      const clipped = intersect(range, visible);
      return (
        clipped && {
          left: timeToX(clipped.start),
          width: (clipped.end - clipped.start) * pixelsPerSecond,
        }
      );
    },
  };
}
