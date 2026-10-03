import { clamp } from "../utils/math.ts";
import { getClipRange } from "./layout.ts";
import type { AudioClip, VideoClip } from "./project.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

/**
 * Plays one clip's decoded audio on the transport's clock, like toy-midi's
 * `AudioBufferPlayback`, so it stays sample-aligned with the playhead instead of
 * being steered like a media element. A clip is heard wherever its own range
 * covers the playhead unless its layer is muted, and its fades are gain
 * automation at the range edges.
 */
export class AudioBufferPlayback implements TransportParticipant {
  private readonly transport: AudioContextTransport;
  private readonly gain: GainNode;
  private readonly unregister: () => void;
  private clip?: VideoClip | AudioClip;
  private muted = false;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;

  constructor({ transport }: { transport: AudioContextTransport }) {
    this.transport = transport;
    this.gain = transport.context.createGain();
    this.gain.connect(transport.context.destination);
    this.unregister = transport.register(this);
  }

  /** Takes effect at the next transport start, like toy-midi's `setSource`. */
  setClip({
    clip,
    muted,
  }: {
    clip: VideoClip | AudioClip;
    /** Whether the clip's layer is muted. */
    muted: boolean;
  }): void {
    this.clip = clip;
    this.muted = muted;
  }

  /** Takes effect at the next transport start, like toy-midi's `setSource`. */
  setBuffer({ buffer }: { buffer: AudioBuffer }): void {
    this.buffer = buffer;
  }

  /** Schedules the rest of the clip from the transport's playback anchor. */
  start(): void {
    const { clip, buffer } = this;
    if (!clip || !buffer || this.muted) {
      return;
    }
    const { contextTime, position } = this.transport.playbackAnchor!;
    const range = getClipRange(clip);
    const from = Math.max(position, range.start);
    if (from >= range.end) {
      return;
    }
    const toContextTime = (time: number) => contextTime + time - position;
    const context = this.transport.context;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.start(
      toContextTime(from),
      clip.in + from - clip.start,
      range.end - from,
    );
    this.source = source;

    const gain = this.gain.gain;
    gain.setValueAtTime(getGainAt({ clip, time: from }), toContextTime(from));
    if (clip.fadeIn && from < range.start + clip.fadeIn) {
      gain.linearRampToValueAtTime(1, toContextTime(range.start + clip.fadeIn));
    }
    if (clip.fadeOut) {
      const fadeStart = Math.max(from, range.end - clip.fadeOut);
      gain.setValueAtTime(
        getGainAt({ clip, time: fadeStart }),
        toContextTime(fadeStart),
      );
      gain.linearRampToValueAtTime(0, toContextTime(range.end));
    }
  }

  stop(): void {
    this.source?.stop();
    this.source?.disconnect();
    this.source = undefined;
    this.gain.gain.cancelScheduledValues(0);
  }

  dispose(): void {
    this.unregister();
    this.gain.disconnect();
  }
}

function getGainAt({
  clip,
  time,
}: {
  clip: VideoClip | AudioClip;
  time: number;
}): number {
  const range = getClipRange(clip);
  const fadeIn = clip.fadeIn ? (time - range.start) / clip.fadeIn : Infinity;
  const fadeOut = clip.fadeOut ? (range.end - time) / clip.fadeOut : Infinity;
  return clamp(Math.min(fadeIn, fadeOut), 0, 1);
}
