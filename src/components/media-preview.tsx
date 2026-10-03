import { useState } from "react";
import type { Layer } from "../lib/project";
import type { EditorLayer } from "../lib/runtime";

/** The selected layer's whole source file, independent of project timing and layout. */
export function MediaPreview({
  layer,
  resolveMediaUrl,
}: {
  layer?: EditorLayer;
  resolveMediaUrl: (src: string) => string;
}) {
  const source = layer && "src" in layer ? layer : undefined;
  return source ? (
    // Remounts per layer so a load failure does not carry over.
    <SourceMedia
      key={source.id}
      layer={source}
      resolveMediaUrl={resolveMediaUrl}
    />
  ) : (
    <p className="grid flex-1 place-items-center p-3 text-center text-xs text-neutral-500">
      Select a video, audio, or image layer to preview its source.
    </p>
  );
}

type SourceLayer = Extract<Layer, { src: string }>;

function SourceMedia({
  layer,
  resolveMediaUrl,
}: {
  layer: SourceLayer;
  resolveMediaUrl: (src: string) => string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      {failed && (
        <p role="alert" className="px-3 pt-3 text-xs text-destructive">
          Could not load {layer.src}. Check that the file exists and your
          browser supports its format.
        </p>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <SourceElement
          layer={layer}
          src={resolveMediaUrl(layer.src)}
          onError={() => setFailed(true)}
        />
      </div>
    </>
  );
}

function SourceElement({
  layer,
  src,
  onError,
}: {
  layer: SourceLayer;
  src: string;
  onError: () => void;
}) {
  switch (layer.type) {
    case "video": {
      return (
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          onError={onError}
          className="max-h-full max-w-full bg-black"
        />
      );
    }
    case "audio": {
      return (
        <audio
          src={src}
          controls
          preload="metadata"
          onError={onError}
          className="w-full"
        />
      );
    }
    case "image": {
      return (
        <img
          src={src}
          alt={layer.name}
          onError={onError}
          className="max-h-full max-w-full object-contain"
        />
      );
    }
  }
}
