import type { Clip } from "./project.ts";

export type BoxEditType = "move";

export type BoxEditDelta = { x: number; y: number };

/**
 * The pointer's travel in canvas pixels moves what the clip places, rounded to
 * whole canvas pixels as the inspector's position fields are: a video or image
 * clip's transform, which carries its crop with it, or a text or color clip's
 * box.
 */
export function applyBoxEdit(
  clip: Exclude<Clip, { type: "audio" }>,
  { type, delta }: { type: BoxEditType; delta: BoxEditDelta },
): Exclude<Clip, { type: "audio" }> {
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
