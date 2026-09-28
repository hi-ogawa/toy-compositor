import { throttle } from "../utils/timing.ts";
import { intersect, layerRange, type Range } from "./layout.ts";
import type { AudioLayer, VideoLayer } from "./project.ts";
import type { AudioContextTransport } from "./transport.ts";

type PlaybackMode = "paused" | "before" | "playing" | "after";

const DRIFT_CHECK_INTERVAL_SECONDS = 1;
const DRIFT_TOLERANCE_SECONDS = 0.1;

/**
 * Makes one layer's `<video>` or `<audio>` follow the transport. While paused
 * it seeks to the playhead, and while playing it plays natively and seeks back
 * when it drifts from the transport, like toy-midi's reference video.
 */
export class MediaPlayback {
  private readonly transport: AudioContextTransport;
  private readonly element: HTMLMediaElement;
  private layer?: VideoLayer | AudioLayer;
  private output?: Range;
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
    element: HTMLMediaElement;
  }) {
    this.transport = transport;
    this.element = element;
    this.unsubscribe = transport.store.subscribe(this.sync);
    // A seek before the metadata loads may not apply, so repeat it after.
    element.addEventListener("loadedmetadata", this.resync);
  }

  setLayer({
    layer,
    output,
  }: {
    layer: VideoLayer | AudioLayer;
    output: Range;
  }): void {
    this.layer = layer;
    this.output = output;
    this.element.muted = layer.muted ?? false;
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
    this.element.volume = this.gainAt(position);
    if (!isPlaying) {
      this.mode = "paused";
      this.pause(Math.min(Math.max(expectedTime, layer.in), layer.out));
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

  /**
   * The render only mixes audio inside the output range, fading at the edges of
   * the layer's part of it, so the preview does the same.
   */
  private gainAt(position: number): number {
    const layer = this.layer!;
    const visible = intersect(layerRange(layer), this.output!);
    if (!visible || position < visible.start || position >= visible.end) {
      return 0;
    }
    const fadeIn = layer.fadeIn
      ? (position - visible.start) / layer.fadeIn
      : Infinity;
    const fadeOut = layer.fadeOut
      ? (visible.end - position) / layer.fadeOut
      : Infinity;
    return Math.min(1, fadeIn, fadeOut);
  }

  private correctDrift(expectedTime: number): void {
    if (
      Math.abs(this.element.currentTime - expectedTime) >
      DRIFT_TOLERANCE_SECONDS
    ) {
      this.element.currentTime = expectedTime;
    }
  }

  private play(time: number): void {
    this.correctDriftThrottled.reset();
    this.element.currentTime = time;
    // A pause before playback starts rejects this promise, which is expected.
    this.element.play().catch(() => {});
  }

  private pause(time: number): void {
    this.correctDriftThrottled.reset();
    this.element.pause();
    if (this.element.currentTime !== time) {
      this.element.currentTime = time;
    }
  }
}
