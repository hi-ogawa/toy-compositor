import { clamp } from "../utils/math.ts";
import { throttle } from "../utils/timing.ts";
import {
  getFrameTimeShownAt,
  type VideoClip,
  type VideoInfo,
} from "./project.ts";
import type { AudioContextTransport } from "./transport.ts";

type PlaybackMode = "paused" | "before" | "playing" | "after";

/** Drift moves slowly, so checking it more often only chases timing noise. */
const DRIFT_CHECK_INTERVAL_SECONDS = 0.1;
/** Drift that a seek fixes faster than a rate change, such as after a stall. */
const SEEK_DRIFT_SECONDS = 1;
/** Drift within a frame or so is left alone, so the rate stays at 1 when in sync. */
const RATE_DEADBAND_SECONDS = 0.02;
/** Seconds over which a rate change closes the drift. */
const RATE_CATCH_UP_SECONDS = 2;
/** Keeps rate changes invisible while catching up. */
const MAX_RATE_CHANGE = 0.1;

/**
 * It shows the frame the render shows, the one nearest the source time. The
 * element shows the last frame at or before its current time, so a paused
 * element seeks just past the nearest frame's timestamp, and a playing element
 * runs half a frame ahead of the source time. While playing it closes drift by
 * nudging `playbackRate` rather than seeking, because a corrective seek lands
 * behind by however long the seek took, which on long keyframe intervals is
 * longer than the drift it corrects. Outside the source range it rests on the
 * clip's edge frames, so the element shows what a hold shows wherever it is
 * drawn. The element is always muted because audio plays on the transport.
 */
export class VideoPlayback {
  private readonly transport: AudioContextTransport;
  private readonly element: HTMLVideoElement;
  private clip?: VideoClip;
  private video?: VideoInfo;
  private mode?: PlaybackMode;
  private readonly unsubscribe: () => void;
  private readonly correctDriftThrottled = throttle(
    (expectedTime: number) => this.correctDrift(expectedTime),
    DRIFT_CHECK_INTERVAL_SECONDS * 1_000,
  );

  constructor({
    transport,
    element,
  }: {
    transport: AudioContextTransport;
    element: HTMLVideoElement;
  }) {
    this.transport = transport;
    this.element = element;
    element.muted = true;
    this.unsubscribe = transport.store.subscribe(this.sync);
    // A seek before the metadata loads may not apply, so repeat it after.
    element.addEventListener("loadedmetadata", this.resync);
  }

  setClip({ clip, video }: { clip: VideoClip; video: VideoInfo }): void {
    this.clip = clip;
    this.video = video;
    // A moved clip re-enters its mode instead of being corrected as drift.
    this.mode = undefined;
    this.sync();
  }

  dispose(): void {
    this.unsubscribe();
    this.element.removeEventListener("loadedmetadata", this.resync);
    this.element.pause();
  }

  private resync = (): void => {
    this.mode = undefined;
    this.sync();
  };

  private sync = (): void => {
    const { clip, video } = this;
    if (!clip || !video) {
      return;
    }
    const { position, isPlaying } = this.transport.store.get();
    const expectedTime = clip.in + position - clip.start;
    if (!isPlaying) {
      this.mode = "paused";
      this.pause(clamp(expectedTime, clip.in, clip.out), video);
      return;
    }

    const mode: PlaybackMode =
      expectedTime < clip.in
        ? "before"
        : expectedTime >= clip.out
          ? "after"
          : "playing";
    if (mode === this.mode) {
      if (mode === "playing") {
        this.correctDriftThrottled.run(expectedTime + 0.5 / video.frameRate);
      }
      return;
    }
    this.mode = mode;
    switch (mode) {
      case "before": {
        this.pause(clip.in, video);
        break;
      }
      case "playing": {
        this.play(expectedTime + 0.5 / video.frameRate, video);
        break;
      }
      case "after": {
        this.pause(clip.out, video);
        break;
      }
    }
  };

  private correctDrift(expectedTime: number): void {
    // Wait out a seek, whose currentTime already reads as the target.
    if (this.element.seeking) {
      return;
    }
    const drift = this.element.currentTime - expectedTime;
    if (Math.abs(drift) > SEEK_DRIFT_SECONDS) {
      this.element.currentTime = expectedTime;
      this.element.playbackRate = 1;
      return;
    }
    this.element.playbackRate =
      Math.abs(drift) < RATE_DEADBAND_SECONDS
        ? 1
        : 1 +
          clamp(
            -drift / RATE_CATCH_UP_SECONDS,
            -MAX_RATE_CHANGE,
            MAX_RATE_CHANGE,
          );
  }

  private play(time: number, video: VideoInfo): void {
    this.correctDriftThrottled.reset();
    // A paused element already shows the playhead's frame, within a frame of
    // the time, and seeking it again would stall playback on the decode.
    if (Math.abs(this.element.currentTime - time) > 1 / video.frameRate) {
      this.element.currentTime = time;
    }
    this.element.playbackRate = 1;
    // A pause before playback starts rejects this promise, which is expected.
    this.element.play().catch(() => {});
  }

  private pause(time: number, video: VideoInfo): void {
    this.correctDriftThrottled.reset();
    this.element.pause();
    this.element.playbackRate = 1;
    const frameTime = getFrameTimeShownAt(video, time) + 0.1 / video.frameRate;
    if (this.element.currentTime !== frameTime) {
      this.element.currentTime = frameTime;
    }
  }
}
