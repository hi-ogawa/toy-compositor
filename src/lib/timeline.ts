export const DEFAULT_PIXELS_PER_SECOND = 100;
export const MIN_PIXELS_PER_SECOND = 1;
export const MAX_PIXELS_PER_SECOND = 1000;

/** Round a time to the nearest frame, kept to the project's millisecond precision. */
export function snapToFrame(time: number, fps: number) {
  return roundToMillisecond(Math.round(time * fps) / fps);
}

export function roundToMillisecond(time: number) {
  return Number(time.toFixed(3));
}

/** Pick a 1-2-5 tick step that keeps labels at least 80px apart. */
export function getRulerStep(pixelsPerSecond: number) {
  const target = 80 / pixelsPerSecond;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10]
    .map((factor) => factor * magnitude)
    .find((step) => step >= target)!;
}

/** Split a 1-2-5 ruler step into minor grid steps: fifths of 1 and 5, quarters of 2. */
export function getRulerSubdivisionStep(step: number) {
  const leading = Math.round(step / 10 ** Math.floor(Math.log10(step)));
  return step / (leading === 2 ? 4 : 5);
}
