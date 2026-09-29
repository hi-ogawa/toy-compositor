import { PanelLeftCloseIcon } from "lucide-react";
import { useState } from "react";
import type { EditorLayer } from "../lib/editor-project";
import type { Layer } from "../lib/project";
import { Button } from "./ui/button";

export function MediaPreview({
  layer,
  resolveMediaUrl,
  onCollapse,
}: {
  layer?: EditorLayer;
  resolveMediaUrl: (src: string) => string;
  onCollapse: () => void;
}) {
  const source = layer && "src" in layer.layer ? layer.layer : undefined;
  return (
    <>
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-3 text-xs">
        <h2
          className="shrink-0 font-semibold"
          title="Full source file, independent of project timing and layout."
        >
          Source
        </h2>
        {source && (
          <span
            className="truncate font-mono text-[10px] text-neutral-400"
            title={source.src}
          >
            {source.src}
          </span>
        )}
        <Button
          aria-label="Collapse source panel"
          title="Collapse source panel"
          aria-expanded={true}
          aria-controls="source-monitor"
          className="ml-auto size-5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
          onClick={onCollapse}
        >
          <PanelLeftCloseIcon className="size-3.5" />
        </Button>
      </div>
      {source ? (
        // Remounts per layer so a load failure does not carry over.
        <SourceMedia
          key={layer?.id}
          layer={source}
          resolveMediaUrl={resolveMediaUrl}
        />
      ) : (
        <p className="grid flex-1 place-items-center p-3 text-center text-xs text-neutral-500">
          Select a video, audio, or image layer to preview its source.
        </p>
      )}
    </>
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
          alt={layer.name ?? layer.src}
          onError={onError}
          className="max-h-full max-w-full object-contain"
        />
      );
    }
  }
}
