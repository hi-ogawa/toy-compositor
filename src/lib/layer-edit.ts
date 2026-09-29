import { clamp } from "../utils/math.ts";
import { getLayerRange } from "./layout.ts";
import type { Layer } from "./project.ts";
import { roundToMillisecond, snapToFrame } from "./timeline.ts";

export type LayerEditType = "move" | "trim-start" | "trim-end";

/**
 * Moves or trims a layer by a timeline delta, like toy-midi's clip move and
 * trims. The dragged edge snaps to the frame grid, the layer keeps at least one
 * frame and starts at or after 0, and a video or audio layer stays within its
 * source. A start trim on a video or audio layer moves `start` and `in`
 * together, so its source stays in place against the rest of the timeline.
 */
export function applyLayerEdit(
  layer: Layer,
  {
    type,
    delta,
    fps,
    sourceDuration = Infinity,
  }: {
    type: LayerEditType;
    delta: number;
    fps: number;
    sourceDuration?: number;
  },
): Layer {
  const range = getLayerRange(layer);
  const frame = 1 / fps;
  const snap = (time: number) => snapToFrame(time, fps);
  switch (type) {
    case "move": {
      const start = Math.max(0, snap(range.start + delta));
      return layer.type === "video" || layer.type === "audio"
        ? { ...layer, start }
        : {
            ...layer,
            start,
            end: roundToMillisecond(layer.end + start - range.start),
          };
    }
    case "trim-start": {
      if (layer.type === "video" || layer.type === "audio") {
        const start = roundToMillisecond(
          clamp(
            snap(range.start + delta),
            Math.max(0, layer.start - layer.in),
            range.end - frame,
          ),
        );
        return {
          ...layer,
          start,
          in: roundToMillisecond(layer.in + start - layer.start),
        };
      }
      return {
        ...layer,
        start: roundToMillisecond(
          clamp(snap(range.start + delta), 0, range.end - frame),
        ),
      };
    }
    case "trim-end": {
      if (layer.type === "video" || layer.type === "audio") {
        const end = clamp(
          snap(range.end + delta),
          range.start + frame,
          layer.start - layer.in + sourceDuration,
        );
        return {
          ...layer,
          out: roundToMillisecond(layer.in + end - layer.start),
        };
      }
      return {
        ...layer,
        end: roundToMillisecond(
          Math.max(range.start + frame, snap(range.end + delta)),
        ),
      };
    }
  }
}
