import { useCallback, useEffect, useState } from "react";
import { AudioBufferPlayback } from "../lib/audio-buffer-playback";
import type { AudioLayer, VideoLayer } from "../lib/project";
import type { AudioContextTransport } from "../lib/transport";
import { VideoPlayback } from "../lib/video-playback";

/** Returns a ref that makes the `<video>` follow the transport as this layer. */
export function useVideoPlayback({
  transport,
  layer,
}: {
  transport: AudioContextTransport;
  layer: VideoLayer;
}) {
  const [playback, setPlayback] = useState<VideoPlayback>();
  useEffect(() => {
    playback?.setLayer({ layer });
  }, [playback, layer]);
  return useCallback(
    (element: HTMLVideoElement | null) => {
      if (!element) {
        return;
      }
      const playback = new VideoPlayback({ transport, element });
      setPlayback(playback);
      return () => playback.dispose();
    },
    [transport],
  );
}

/** Decodes the layer's source and plays it on the transport's clock. */
export function useAudioBufferPlayback({
  transport,
  layer,
  src,
}: {
  transport: AudioContextTransport;
  layer: VideoLayer | AudioLayer;
  src: string;
}) {
  const [playback, setPlayback] = useState<AudioBufferPlayback>();
  useEffect(() => {
    const playback = new AudioBufferPlayback({ transport });
    setPlayback(playback);
    return () => playback.dispose();
  }, [transport]);
  useEffect(() => {
    playback?.setLayer({ layer });
  }, [playback, layer]);
  useEffect(() => {
    if (!playback) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      const response = await fetch(src, { signal: controller.signal });
      const buffer = await transport.context.decodeAudioData(
        await response.arrayBuffer(),
      );
      if (!controller.signal.aborted) {
        playback.setBuffer({ buffer });
      }
    })()
      // An aborted load, or a video file without an audio stream, plays nothing.
      .catch(() => {});
    return () => controller.abort();
  }, [transport, playback, src]);
}
