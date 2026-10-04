import { clamp } from "../utils/math.ts";
import { getClipRange } from "./layout.ts";
import type { Clip, Project } from "./project.ts";
import { roundToMillisecond, snapToFrame } from "./timeline.ts";

export type ClipEditType = "move" | "trim-start" | "trim-end";

/**
 * The dragged edge snaps to the frame grid, the clip keeps at least one frame
 * and starts at or after 0, and a video or audio clip stays within its
 * source's time range. A start trim on a video or audio clip shifts its source
 * in point with it, so the source stays in place against the rest of the
 * timeline.
 *
 * TODO(multi-clip): Clamp at the neighboring clips on the layer, once the
 * editor can put several clips on a layer.
 */
export function applyClipEdit(
  clip: Clip,
  {
    type,
    delta,
    fps,
    mediaInfoMap,
  }: {
    type: ClipEditType;
    delta: number;
    fps: number;
    mediaInfoMap: Project["media"];
  },
): Clip {
  const range = getClipRange(clip);
  const frame = 1 / fps;
  const snap = (time: number) => snapToFrame(time, fps);
  switch (type) {
    case "move": {
      const start = Math.max(0, snap(range.start + delta));
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
            Math.max(0, clip.start - clip.in + mediaInfoMap[clip.src].start),
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
          clamp(snap(range.start + delta), 0, range.end - frame),
        ),
      };
    }
    case "trim-end": {
      if (clip.type === "video" || clip.type === "audio") {
        const end = clamp(
          snap(range.end + delta),
          range.start + frame,
          clip.start - clip.in + mediaInfoMap[clip.src].end,
        );
        return {
          ...clip,
          out: roundToMillisecond(clip.in + end - clip.start),
        };
      }
      return {
        ...clip,
        end: roundToMillisecond(
          Math.max(range.start + frame, snap(range.end + delta)),
        ),
      };
    }
  }
}
