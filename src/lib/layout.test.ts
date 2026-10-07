import { describe, expect, test } from "vite-plus/test";
import {
  getResizedTransform,
  getVisibleBox,
  type BoxHandle,
} from "./layout.ts";
import type { Box, Crop, Size, Transform } from "./project.ts";

const NO_CROP: Crop = { left: 0, right: 0, top: 0, bottom: 0 };

const CORNERS: BoxHandle[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

describe(getResizedTransform, () => {
  const size: Size = { width: 160, height: 90 };
  const transform: Transform = { x: 420, y: 240, scale: 1 };

  test("keeps the transform when the handle has not moved", () => {
    for (const handle of CORNERS) {
      expect(
        getResizedTransform({
          size,
          crop: NO_CROP,
          transform,
          handle,
          delta: { x: 0, y: 0 },
        }),
      ).toEqual(transform);
    }
  });

  test("scales by the larger axis ratio from the opposite corner", () => {
    // Width leads, 240 / 160 over 110 / 90.
    expect(
      getResizedTransform({
        size,
        crop: NO_CROP,
        transform,
        handle: { x: 1, y: 1 },
        delta: { x: 80, y: 20 },
      }),
    ).toEqual({ x: 420, y: 240, scale: 1.5 });
    // Height leads when shrinking, 80 / 90 over 80 / 160, and the scale
    // rounds as the inspector's field does.
    expect(
      getResizedTransform({
        size,
        crop: NO_CROP,
        transform,
        handle: { x: 1, y: 1 },
        delta: { x: -80, y: -10 },
      }),
    ).toEqual({ x: 420, y: 240, scale: 0.888889 });
  });

  test("rounds the size before placing it against the anchor", () => {
    // 1.25 makes the height 112.5, which places as 113, so the top edge sits
    // at 330 - 113 to keep the bottom-right corner at (580, 330).
    const resized = getResizedTransform({
      size,
      crop: NO_CROP,
      transform,
      handle: { x: 0, y: 0 },
      delta: { x: -40, y: -10 },
    });
    expect(resized).toEqual({ x: 380, y: 217, scale: 1.25 });
    expect(getVisibleBox({ size, crop: NO_CROP, transform: resized })).toEqual({
      x: 380,
      y: 217,
      width: 200,
      height: 113,
    });
  });

  test("keeps at least 1px when dragged past the opposite corner", () => {
    const resized = getResizedTransform({
      size,
      crop: NO_CROP,
      transform,
      handle: { x: 1, y: 1 },
      delta: { x: -500, y: -500 },
    });
    expect(getVisibleBox({ size, crop: NO_CROP, transform: resized })).toEqual({
      x: 420,
      y: 240,
      width: 2,
      height: 1,
    });
  });

  test("keeps the opposite corner pixel-exact with a crop and a fractional scale", () => {
    const size: Size = { width: 1920, height: 1080 };
    const crop: Crop = { left: 0.1, right: 0.05, top: 0.2, bottom: 0.03 };
    const transform: Transform = { x: -37, y: 15, scale: 0.3333 };
    const start = getVisibleBox({ size, crop, transform });
    for (const handle of CORNERS) {
      for (const delta of [
        { x: 13.7, y: -4.2 },
        { x: -21.3, y: 8.9 },
        { x: 101.1, y: 57.5 },
        { x: -0.4, y: 0.6 },
      ]) {
        const resized = getResizedTransform({
          size,
          crop,
          transform,
          handle,
          delta,
        });
        expect(Number.isInteger(resized.x)).toBe(true);
        expect(Number.isInteger(resized.y)).toBe(true);
        const end = getVisibleBox({ size, crop, transform: resized });
        expect(getOppositeCorner(end, handle)).toEqual(
          getOppositeCorner(start, handle),
        );
      }
    }
  });
});

/** The corner a resize from the handle keeps fixed. */
function getOppositeCorner(box: Box, handle: BoxHandle) {
  return {
    x: box.x + (1 - handle.x) * box.width,
    y: box.y + (1 - handle.y) * box.height,
  };
}
