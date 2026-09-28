import { useCallback, useEffect, useState } from "react";
import { MediaPlayback } from "../lib/media-playback";
import type { AudioLayer, VideoLayer } from "../lib/project";
import type { AudioContextTransport } from "../lib/transport";

/** Returns a ref that makes the media element follow the transport as this layer. */
export function useMediaPlayback({
  transport,
  layer,
}: {
  transport: AudioContextTransport;
  layer: VideoLayer | AudioLayer;
}) {
  const [playback, setPlayback] = useState<MediaPlayback>();
  useEffect(() => {
    playback?.setLayer({ layer });
  }, [playback, layer]);
  return useCallback(
    (element: HTMLMediaElement | null) => {
      if (!element) {
        return;
      }
      const playback = new MediaPlayback({ transport, element });
      setPlayback(playback);
      return () => playback.dispose();
    },
    [transport],
  );
}
