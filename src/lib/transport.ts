import { createStore } from "../utils/store.ts";

/** Gives every participant time to schedule against the same future audio frame. */
const PLAYBACK_LEAD_SECONDS = 0.03;

/** A playback object whose lifecycle follows this transport. */
export interface TransportParticipant {
  start(): void;
  stop(): void;
}

type TransportState = {
  position: number;
  isPlaying: boolean;
};

type PlaybackAnchor = {
  contextTime: number;
  position: number;
};

/**
 * Owns the project playhead, after toy-midi's recorder transport. Audio is
 * scheduled on the `AudioContext` clock, which runs even when a project has no
 * audio, and the published position is the one being heard, so video elements
 * that follow it stay in sync with the sound.
 */
export class AudioContextTransport {
  readonly store = createStore<TransportState>(() => ({
    position: 0,
    isPlaying: false,
  }));

  /**
   * Maps an `AudioContext` time to the project position at which the current
   * playback run begins. It is available to participants during start.
   */
  playbackAnchor?: PlaybackAnchor;
  private readonly participants = new Set<TransportParticipant>();
  private frame?: number;

  readonly context: AudioContext;

  constructor(context: AudioContext) {
    this.context = context;
  }

  /** Joins a participant to future transport starts and returns its disposer. */
  register(participant: TransportParticipant): () => void {
    this.participants.add(participant);
    return () => {
      participant.stop();
      this.participants.delete(participant);
    };
  }

  play(): void {
    if (this.store.get().isPlaying) {
      return;
    }
    const { position } = this.store.get();
    this.playbackAnchor = {
      contextTime: this.context.currentTime + PLAYBACK_LEAD_SECONDS,
      position,
    };
    this.store.update({ isPlaying: true });
    for (const participant of this.participants) {
      participant.start();
    }
    this.tick();
  }

  pause(): void {
    if (!this.store.get().isPlaying) {
      return;
    }
    for (const participant of this.participants) {
      participant.stop();
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

  /** Converts an `AudioContext` time to a project position in the current run. */
  getPositionAt(contextTime: number): number {
    const anchor = this.playbackAnchor!;
    return anchor.position + contextTime - anchor.contextTime;
  }

  /** Publishes the heard position on animation frames while playing. */
  private tick = (): void => {
    this.store.update({ position: this.getPlaybackPosition() });
    this.frame = requestAnimationFrame(this.tick);
  };

  /**
   * The position reaching the speakers now. `currentTime` is where the context
   * is rendering, which runs ahead of what is heard by the output latency.
   */
  private getPlaybackPosition(): number {
    const { contextTime = 0, performanceTime = 0 } =
      this.context.getOutputTimestamp();
    const heardTime =
      contextTime + (performance.now() - performanceTime) / 1000;
    return Math.max(
      this.playbackAnchor!.position,
      this.getPositionAt(heardTime),
    );
  }
}
