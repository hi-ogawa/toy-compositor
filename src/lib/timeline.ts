export const DEFAULT_PIXELS_PER_SECOND = 100;
export const MIN_PIXELS_PER_SECOND = 1;
export const MAX_PIXELS_PER_SECOND = 1000;

/** Pick a 1-2-5 tick step that keeps labels at least 80px apart. */
export function rulerStep(pixelsPerSecond: number) {
  const target = 80 / pixelsPerSecond;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10]
    .map((factor) => factor * magnitude)
    .find((step) => step >= target)!;
}
