import { clamp } from "../utils/math.ts";
import { getLayerRange } from "./layout.ts";
import type { AudioLayer, VideoLayer } from "./project.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

/**
 * Plays one layer's decoded audio on the transport's clock, like toy-midi's
 * `AudioBufferPlayback`, so it stays sample-aligned with the playhead instead of
 * being steered like a media element. A layer is heard wherever its own range
 * covers the playhead, and its fades are gain automation at the range edges.
 */
export class AudioBufferPlayback implements TransportParticipant {
  private readonly transport: AudioContextTransport;
  private readonly gain: GainNode;
  private readonly unregister: () => void;
  private layer?: VideoLayer | AudioLayer;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;

  constructor({ transport }: { transport: AudioContextTransport }) {
    this.transport = transport;
    this.gain = transport.context.createGain();
    this.gain.connect(transport.context.destination);
    this.unregister = transport.register(this);
  }

  /** Takes effect at the next transport start, like toy-midi's `setSource`. */
  setLayer({ layer }: { layer: VideoLayer | AudioLayer }): void {
    this.layer = layer;
  }

  /** Takes effect at the next transport start, like toy-midi's `setSource`. */
  setBuffer({ buffer }: { buffer: AudioBuffer }): void {
    this.buffer = buffer;
  }

  /** Schedules the rest of the layer from the transport's playback anchor. */
  start(): void {
    const { layer, buffer } = this;
    if (!layer || !buffer || layer.muted) {
      return;
    }
    const { contextTime, position } = this.transport.playbackAnchor!;
    const range = getLayerRange(layer);
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
      layer.in + from - layer.start,
      range.end - from,
    );
    this.source = source;

    const gain = this.gain.gain;
    gain.setValueAtTime(getGainAt({ layer, time: from }), toContextTime(from));
    if (layer.fadeIn && from < range.start + layer.fadeIn) {
      gain.linearRampToValueAtTime(
        1,
        toContextTime(range.start + layer.fadeIn),
      );
    }
    if (layer.fadeOut) {
      const fadeStart = Math.max(from, range.end - layer.fadeOut);
      gain.setValueAtTime(
        getGainAt({ layer, time: fadeStart }),
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
  layer,
  time,
}: {
  layer: VideoLayer | AudioLayer;
  time: number;
}): number {
  const range = getLayerRange(layer);
  const fadeIn = layer.fadeIn ? (time - range.start) / layer.fadeIn : Infinity;
  const fadeOut = layer.fadeOut ? (range.end - time) / layer.fadeOut : Infinity;
  return clamp(Math.min(fadeIn, fadeOut), 0, 1);
}
