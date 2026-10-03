import { useState } from "react";
import type { Clip } from "../lib/project";
import type { ClipLocation } from "../lib/runtime";

/** The selected clip's whole source file, independent of project timing and layout. */
export function MediaPreview({
  selected,
  resolveMediaUrl,
}: {
  selected?: ClipLocation;
  resolveMediaUrl: (src: string) => string;
}) {
  return selected && "src" in selected.clip ? (
    // Remounts per clip so a load failure does not carry over.
    <SourceMedia
      key={selected.clip.id}
      clip={selected.clip}
      name={selected.layer.name}
      resolveMediaUrl={resolveMediaUrl}
    />
  ) : (
    <p className="grid flex-1 place-items-center p-3 text-center text-xs text-neutral-500">
      Select a video, audio, or image clip to preview its source.
    </p>
  );
}

type SourceClip = Extract<Clip, { src: string }>;

function SourceMedia({
  clip,
  name,
  resolveMediaUrl,
}: {
  clip: SourceClip;
  /** The layer's name, which labels an image. */
  name: string;
  resolveMediaUrl: (src: string) => string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      {failed && (
        <p role="alert" className="px-3 pt-3 text-xs text-destructive">
          Could not load {clip.src}. Check that the file exists and your browser
          supports its format.
        </p>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <SourceElement
          clip={clip}
          name={name}
          src={resolveMediaUrl(clip.src)}
          onError={() => setFailed(true)}
        />
      </div>
    </>
  );
}

function SourceElement({
  clip,
  name,
  src,
  onError,
}: {
  clip: SourceClip;
  name: string;
  src: string;
  onError: () => void;
}) {
  switch (clip.type) {
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
          alt={name}
          onError={onError}
          className="max-h-full max-w-full object-contain"
        />
      );
    }
  }
}
