import { createStore } from "../utils/store.ts";

type TransportState = {
  position: number;
  isPlaying: boolean;
};

type PlaybackAnchor = {
  contextTime: number;
  position: number;
};

/**
 * Owns the project playhead during playback. The clock is
 * `AudioContext.currentTime`, which runs even when a project has no audio, and
 * media elements follow the published position instead of driving it.
 */
export class AudioContextTransport {
  readonly store = createStore<TransportState>(() => ({
    position: 0,
    isPlaying: false,
  }));

  private context?: AudioContext;
  private playbackAnchor?: PlaybackAnchor;
  private frame?: number;

  play(): void {
    if (this.store.get().isPlaying) {
      return;
    }
    // Create the context on the first play, which is a user gesture, so the
    // browser lets it start running.
    this.context ??= new AudioContext();
    this.playbackAnchor = {
      contextTime: this.context.currentTime,
      position: this.store.get().position,
    };
    this.store.update({ isPlaying: true });
    this.tick();
  }

  pause(): void {
    if (!this.store.get().isPlaying) {
      return;
    }
    const position = this.getPlaybackPosition();
    this.playbackAnchor = undefined;
    cancelAnimationFrame(this.frame!);
    this.store.update({ isPlaying: false, position });
  }

  /** Moves the playhead, continuing playback from there when it is running. */
  seek(position: number): void {
    const wasPlaying = this.store.get().isPlaying;
    this.pause();
    this.store.update({ position });
    if (wasPlaying) {
      this.play();
    }
  }

  /** Publishes the audio clock position on animation frames while playing. */
  private tick = (): void => {
    this.store.update({ position: this.getPlaybackPosition() });
    this.frame = requestAnimationFrame(this.tick);
  };

  private getPlaybackPosition(): number {
    const anchor = this.playbackAnchor!;
    return anchor.position + this.context!.currentTime - anchor.contextTime;
  }
}
