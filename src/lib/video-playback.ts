import { clamp } from "../utils/math.ts";
import { throttle } from "../utils/timing.ts";
import type { VideoLayer } from "./project.ts";
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
 * Makes one video layer's `<video>` follow the transport. While paused it seeks
 * to the playhead. While playing it plays natively and closes any drift by
 * nudging `playbackRate`, because a corrective seek lands behind by however
 * long the seek took, which on long keyframe intervals is longer than the drift
 * it corrects. Outside the source range it rests on `in` before and `out`
 * after, so the element shows the layer's edge frames wherever it is drawn,
 * which is what a hold shows. The element is always muted, since audio plays on
 * the transport.
 */
export class VideoPlayback {
  private readonly transport: AudioContextTransport;
  private readonly element: HTMLVideoElement;
  private layer?: VideoLayer;
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

  setLayer({ layer }: { layer: VideoLayer }): void {
    this.layer = layer;
    // A moved layer re-enters its mode instead of being corrected as drift.
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
    const layer = this.layer;
    if (!layer) {
      return;
    }
    const { position, isPlaying } = this.transport.store.get();
    const expectedTime = layer.in + position - layer.start;
    if (!isPlaying) {
      this.mode = "paused";
      this.pause(clamp(expectedTime, layer.in, layer.out));
      return;
    }

    const mode: PlaybackMode =
      expectedTime < layer.in
        ? "before"
        : expectedTime >= layer.out
          ? "after"
          : "playing";
    if (mode === this.mode) {
      if (mode === "playing") {
        this.correctDriftThrottled.run(expectedTime);
      }
      return;
    }
    this.mode = mode;
    switch (mode) {
      case "before": {
        this.pause(layer.in);
        break;
      }
      case "playing": {
        this.play(expectedTime);
        break;
      }
      case "after": {
        this.pause(layer.out);
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

  private play(time: number): void {
    this.correctDriftThrottled.reset();
    // A paused element already shows the playhead's frame, and seeking it
    // again would stall playback on the decode.
    if (Math.abs(this.element.currentTime - time) > RATE_DEADBAND_SECONDS) {
      this.element.currentTime = time;
    }
    this.element.playbackRate = 1;
    // A pause before playback starts rejects this promise, which is expected.
    this.element.play().catch(() => {});
  }

  private pause(time: number): void {
    this.correctDriftThrottled.reset();
    this.element.pause();
    this.element.playbackRate = 1;
    if (this.element.currentTime !== time) {
      this.element.currentTime = time;
    }
  }
}
