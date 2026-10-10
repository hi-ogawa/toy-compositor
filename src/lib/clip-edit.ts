import { clamp } from "../utils/math.ts";
import { getClipRange, getPictureRange, type TimeRange } from "./layout.ts";
import type { Clip, Project, VisualClip } from "./project.ts";
import { roundToMillisecond, snapToFrame } from "./timeline.ts";

export type TimeEditType = "move" | "trim-start" | "trim-end";

/**
 * The dragged edge snaps to the frame grid, the clip keeps at least one frame
 * and starts at or after 0, and a video or audio clip stays within its
 * source's time range. The clip's picture, including a video clip's hold,
 * stays within `bounds`, the gap its neighbors on the layer leave
 * (`getClipBounds`). A start trim on a video or audio clip shifts its source
 * in point with it, so the source stays in place against the rest of the
 * timeline.
 */
export function applyTimeEdit(
  clip: Clip,
  {
    type,
    delta,
    fps,
    mediaInfoMap,
    bounds,
  }: {
    type: TimeEditType;
    delta: number;
    fps: number;
    mediaInfoMap: Project["media"];
    bounds: TimeRange;
  },
): Clip {
  const range = getClipRange(clip);
  const frame = 1 / fps;
  const snap = (time: number) => snapToFrame(time, fps);
  const hold = clip.type === "video" ? clip.hold : { before: 0, after: 0 };
  switch (type) {
    case "move": {
      const start = roundToMillisecond(
        clamp(
          snap(range.start + delta),
          Math.max(0, bounds.start + hold.before),
          bounds.end - (range.end - range.start) - hold.after,
        ),
      );
      return clip.type === "video" || clip.type === "audio"
        ? { ...clip, start }
        : {
            ...clip,
            start,
            end: roundToMillisecond(clip.end + start - range.start),
          };
    }
    case "trim-start": {
      if (clip.type === "video" || clip.type === "audio") {
        const start = roundToMillisecond(
          clamp(
            snap(range.start + delta),
            Math.max(
              0,
              clip.start - clip.in + mediaInfoMap[clip.src].start,
              bounds.start + hold.before,
            ),
            range.end - frame,
          ),
        );
        return {
          ...clip,
          start,
          in: roundToMillisecond(clip.in + start - clip.start),
        };
      }
      return {
        ...clip,
        start: roundToMillisecond(
          clamp(
            snap(range.start + delta),
            Math.max(0, bounds.start),
            range.end - frame,
          ),
        ),
      };
    }
    case "trim-end": {
      if (clip.type === "video" || clip.type === "audio") {
        const end = clamp(
          snap(range.end + delta),
          range.start + frame,
          Math.min(
            clip.start - clip.in + mediaInfoMap[clip.src].end,
            bounds.end - hold.after,
          ),
        );
        return {
          ...clip,
          out: roundToMillisecond(clip.in + end - clip.start),
        };
      }
      return {
        ...clip,
        end: roundToMillisecond(
          clamp(snap(range.end + delta), range.start + frame, bounds.end),
        ),
      };
    }
  }
}

/**
 * The gap a layer's clip at `index` may fill: from the end of the previous
 * clip's picture to the start of the next one's.
 */
export function getClipBounds(
  clips: readonly Clip[],
  index: number,
): TimeRange {
  const previous = clips[index - 1];
  const next = clips[index + 1];
  return {
    start: previous ? getPictureRange(previous).end : -Infinity,
    end: next ? getPictureRange(next).start : Infinity,
  };
}

/**
 * Places a new clip at its start in a gap between a layer's clips, ending it
 * at the next clip's picture when the gap is shorter than the clip. Returns
 * undefined when the start falls on another clip's picture.
 */
export function fitClipInGap(
  clip: Clip,
  clips: readonly Clip[],
): Clip | undefined {
  const { start } = clip;
  const pictures = clips.map((clip) => {
    const picture = getPictureRange(clip);
    return {
      start: roundToMillisecond(picture.start),
      end: roundToMillisecond(picture.end),
    };
  });
  if (
    pictures.some((picture) => picture.start <= start && start < picture.end)
  ) {
    return undefined;
  }
  const end = Math.min(
    getClipRange(clip).end,
    ...pictures
      .filter((picture) => picture.start > start)
      .map((picture) => picture.start),
  );
  return clip.type === "video" || clip.type === "audio"
    ? { ...clip, out: roundToMillisecond(clip.in + end - start) }
    : { ...clip, end };
}

export type CanvasEditType = "move";

export type CanvasEditDelta = { x: number; y: number };

/**
 * The pointer's travel in canvas pixels moves what the clip places, rounded to
 * whole canvas pixels as the inspector's position fields are: a video or image
 * clip's transform, which carries its crop with it, or a text or color clip's
 * box.
 */
export function applyCanvasEdit(
  clip: VisualClip,
  { type, delta }: { type: CanvasEditType; delta: CanvasEditDelta },
): VisualClip {
  switch (type) {
    case "move": {
      const x = Math.round(delta.x);
      const y = Math.round(delta.y);
      if (clip.type === "video" || clip.type === "image") {
        return {
          ...clip,
          transform: {
            ...clip.transform,
            x: clip.transform.x + x,
            y: clip.transform.y + y,
          },
        };
      }
      return {
        ...clip,
        box: { ...clip.box, x: clip.box.x + x, y: clip.box.y + y },
      };
    }
  }
}
