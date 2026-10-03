import { clamp } from "../utils/math.ts";
import { getClipRange, getPictureRange, type TimeRange } from "./layout.ts";
import type { Clip, Project } from "./project.ts";
import { roundToMillisecond, snapToFrame } from "./timeline.ts";

export type ClipEditType = "move" | "trim-start" | "trim-end";

/**
 * Moves or trims a clip by a timeline delta, like toy-midi's clip move and
 * trims. The dragged edge snaps to the frame grid, the clip keeps at least one
 * frame and starts at or after 0, its picture stays within the gap between its
 * neighbors, and a video or audio clip stays within its source's time range, as
 * its media info records it. A start trim on a video or audio clip moves
 * `start` and `in` together, so its source stays in place against the rest of
 * the timeline.
 */
export function applyClipEdit(
  clip: Clip,
  {
    type,
    delta,
    fps,
    mediaInfoMap,
    gap,
  }: {
    type: ClipEditType;
    delta: number;
    fps: number;
    mediaInfoMap: Project["media"];
    /** The span between the neighboring clips' pictures, from `getClipGap`. */
    gap: TimeRange;
  },
): Clip {
  const range = getClipRange(clip);
  const picture = getPictureRange(clip);
  // The range's own bounds, which keep the held picture within the gap.
  const minStart = Math.max(0, gap.start + range.start - picture.start);
  const maxEnd = gap.end - (picture.end - range.end);
  const frame = 1 / fps;
  const snap = (time: number) => snapToFrame(time, fps);
  switch (type) {
    case "move": {
      const start = roundToMillisecond(
        clamp(
          snap(range.start + delta),
          minStart,
          maxEnd - (range.end - range.start),
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
              minStart,
              clip.start - clip.in + mediaInfoMap[clip.src].start,
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
          clamp(snap(range.start + delta), minStart, range.end - frame),
        ),
      };
    }
    case "trim-end": {
      if (clip.type === "video" || clip.type === "audio") {
        const end = clamp(
          snap(range.end + delta),
          range.start + frame,
          Math.min(maxEnd, clip.start - clip.in + mediaInfoMap[clip.src].end),
        );
        return {
          ...clip,
          out: roundToMillisecond(clip.in + end - clip.start),
        };
      }
      return {
        ...clip,
        end: roundToMillisecond(
          clamp(snap(range.end + delta), range.start + frame, maxEnd),
        ),
      };
    }
  }
}

/** The span a layer's clip can fill, between its neighbors' pictures. */
export function getClipGap({
  clips,
  index,
}: {
  clips: readonly Clip[];
  index: number;
}): TimeRange {
  const previous = clips[index - 1];
  const next = clips[index + 1];
  return {
    start: previous ? getPictureRange(previous).end : -Infinity,
    end: next ? getPictureRange(next).start : Infinity,
  };
}
