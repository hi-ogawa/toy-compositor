import type { VideoInfo } from "./project.ts";

/**
 * The frame shown at a source time is the frame whose timestamp is nearest to
 * it, and this returns that frame's timestamp. Project times are rounded to
 * milliseconds and a source's first frame can start off the project's frame
 * grid, so a time often lands a hair before or after a frame, and picking the
 * nearest frame keeps the render and the editor from disagreeing by one.
 * Assumes a constant frame rate source.
 */
export function getFrameTimeShownAt(video: VideoInfo, time: number): number {
  const { startTime, frameRate } = video;
  return startTime + Math.round((time - startTime) * frameRate) / frameRate;
}
