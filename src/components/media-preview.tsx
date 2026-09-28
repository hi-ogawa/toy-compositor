import { useEffect, useRef, useState } from "react";
import type { Layer } from "../lib/project";

export function MediaPreview({
  layer,
  visible,
  resolveMediaUrl,
}: {
  layer?: Layer;
  visible: boolean;
  resolveMediaUrl: (src: string) => string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!visible) {
      videoRef.current?.pause();
      audioRef.current?.pause();
    }
  }, [visible]);
  const [failed, setFailed] = useState(false);
  if (!layer || !("src" in layer)) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Select a video, audio, or image layer to preview its source.
      </p>
    );
  }
  const src = resolveMediaUrl(layer.src);
  const onError = () => setFailed(true);
  return (
    <section className="flex h-full min-h-0 flex-col gap-2">
      <div className="text-sm">
        <h2 className="font-medium">Source</h2>
        <p className="break-all text-muted-foreground">{layer.src}</p>
        <p className="text-muted-foreground">
          Full source file, independent of project timing and layout.
        </p>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Could not load {layer.src}. Check that the file exists and your
          browser supports its format.
        </p>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {layer.type === "video" && (
          <video
            ref={videoRef}
            src={src}
            controls
            playsInline
            preload="metadata"
            onError={onError}
            className="max-h-full max-w-full bg-black"
          />
        )}
        {layer.type === "audio" && (
          <audio
            ref={audioRef}
            src={src}
            controls
            preload="metadata"
            onError={onError}
            className="w-full"
          />
        )}
        {layer.type === "image" && (
          <img
            src={src}
            alt={layer.name ?? layer.src}
            onError={onError}
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>
    </section>
  );
}
