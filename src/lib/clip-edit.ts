import { clamp } from "../utils/math.ts";
import { getClipRange } from "./layout.ts";
import type { Clip, Project, VisualClip } from "./project.ts";
import { roundToMillisecond, snapToFrame } from "./timeline.ts";

// TODO(time-edit): Rename to `TimeEditType`, with `applyClipEdit` and the time
// edit methods of `useLayerInteraction`, because canvas edits are clip edits too.
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
