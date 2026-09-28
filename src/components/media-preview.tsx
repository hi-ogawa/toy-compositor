import { useState } from "react";
import type { Layer } from "../lib/project";

export function MediaPreview({
  layer,
  resolveMediaUrl,
}: {
  layer: Layer | undefined;
  resolveMediaUrl: (src: string) => string;
}) {
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
    <section className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="text-sm">
        <h2 className="font-medium">Source media</h2>
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
            src={src}
            controls
            playsInline
            preload="metadata"
            onError={onError}
            className="max-h-full w-full bg-black"
          />
        )}
        {layer.type === "audio" && (
          <audio
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
