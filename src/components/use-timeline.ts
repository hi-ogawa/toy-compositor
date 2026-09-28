import { useCallback, useRef, useState } from "react";
import { intersect, layerRange, outputRange, type Range } from "../lib/layout";
import type { Project } from "../lib/project";

export const TIMELINE_LABEL_WIDTH = 144;

export type TimelineView = ReturnType<typeof useTimeline>;

/** Native scrolling and zoom share one time-to-pixel mapping across all rows. */
export function useTimeline({ project }: { project: Project }) {
  const ranges = [
    outputRange(project),
    ...project.layers.map((layer) => layerRange(layer)),
  ];
  const start = Math.floor(
    Math.min(
      0,
      ...ranges.map((range) => range.start),
      ...(project.locators ?? []).map((locator) => locator.time),
    ),
  );
  const end =
    Math.max(
      start + 1,
      ...ranges.map((range) => range.end),
      ...(project.locators ?? []).map((locator) => locator.time),
    ) + 1;
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [zoom, setZoom] = useState<number>();
  const viewport = useRef<HTMLDivElement | null>(null);
  const pixelsPerSecond =
    zoom ?? Math.max(2, Math.min(400, viewportWidth / (end - start)));
  const timeWidth = Math.max(viewportWidth, (end - start) * pixelsPerSecond);
  const visibleStart = start + scrollLeft / pixelsPerSecond;
  const visibleEnd = visibleStart + viewportWidth / pixelsPerSecond;
  const viewportRef = useCallback((element: HTMLDivElement | null) => {
    viewport.current = element;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() =>
      setViewportWidth(Math.max(0, element.clientWidth - TIMELINE_LABEL_WIDTH)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const visible = { start: visibleStart, end: visibleEnd };
  const timeToX = (time: number) => (time - start) * pixelsPerSecond;
  return {
    timeWidth,
    pixelsPerSecond,
    tickStep: rulerStep(pixelsPerSecond),
    visible,
    viewportRef,
    onScroll: () => setScrollLeft(viewport.current!.scrollLeft),
    setZoom,
    timeToX,
    xToTime: (x: number) => start + x / pixelsPerSecond,
    isVisible: (time: number) => time >= visibleStart && time <= visibleEnd,
    /** Position a range within the graph, or nothing when it is scrolled out of view. */
    rangeStyle: (range: Range) => {
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

/** Pick a 1-2-5 tick step that keeps labels at least 80px apart. */
function rulerStep(pixelsPerSecond: number) {
  const target = 80 / pixelsPerSecond;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10]
    .map((factor) => factor * magnitude)
    .find((step) => step >= target)!;
}
