import { describe, expect, test } from "vite-plus/test";
import {
  getResizedBox,
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

const EDGES: BoxHandle[] = [
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0.5 },
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

describe(getResizedBox, () => {
  const box: Box = { x: 40, y: 100, width: 240, height: 135 };

  test("an edge handle changes only its own axis", () => {
    expect(
      getResizedBox({ box, handle: { x: 1, y: 0.5 }, delta: { x: 40, y: 25 } }),
    ).toEqual({ x: 40, y: 100, width: 280, height: 135 });
    expect(
      getResizedBox({ box, handle: { x: 0.5, y: 0 }, delta: { x: 25, y: 20 } }),
    ).toEqual({ x: 40, y: 120, width: 240, height: 115 });
  });

  test("a corner handle changes width and height freely", () => {
    expect(
      getResizedBox({ box, handle: { x: 1, y: 1 }, delta: { x: 60, y: -35 } }),
    ).toEqual({ x: 40, y: 100, width: 300, height: 100 });
  });

  test("rounds the size before placing it against the anchor", () => {
    // 229.5 and 142.5 round to 230 and 143, and the bottom-right corner stays
    // at (280, 235).
    expect(
      getResizedBox({
        box,
        handle: { x: 0, y: 0 },
        delta: { x: 10.5, y: -7.5 },
      }),
    ).toEqual({ x: 50, y: 92, width: 230, height: 143 });
  });

  test("keeps at least 1px when dragged past the opposite side", () => {
    expect(
      getResizedBox({
        box,
        handle: { x: 0, y: 0 },
        delta: { x: 500, y: 500 },
      }),
    ).toEqual({ x: 279, y: 234, width: 1, height: 1 });
  });

  test("keeps the opposite side pixel-exact for every handle", () => {
    for (const handle of [...CORNERS, ...EDGES]) {
      for (const delta of [
        { x: 13.7, y: -4.2 },
        { x: -21.3, y: 8.9 },
        { x: 0.5, y: -0.5 },
      ]) {
        const resized = getResizedBox({ box, handle, delta });
        expect(Object.values(resized).every(Number.isInteger)).toBe(true);
        expect(getOppositeCorner(resized, handle)).toEqual(
          getOppositeCorner(box, handle),
        );
      }
    }
  });
});

/**
 * The point a resize from the handle keeps fixed, the opposite corner or the
 * middle of the opposite edge.
 */
function getOppositeCorner(box: Box, handle: BoxHandle) {
  return {
    x: box.x + (1 - handle.x) * box.width,
    y: box.y + (1 - handle.y) * box.height,
  };
}
