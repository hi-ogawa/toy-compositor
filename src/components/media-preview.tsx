import { PanelLeftCloseIcon } from "lucide-react";
import { useState } from "react";
import type { Layer } from "../lib/project";
import { PanelHeader } from "./panel-header";
import { Button } from "./ui/button";

export function MediaPreview({
  layer,
  resolveMediaUrl,
  onCollapse,
}: {
  layer?: Layer;
  resolveMediaUrl: (src: string) => string;
  onCollapse: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const header = (
    <PanelHeader
      title="Source"
      titleTooltip="Full source file, independent of project timing and layout."
    >
      {layer && "src" in layer && (
        <span
          className="truncate font-mono text-[10px] text-neutral-400"
          title={layer.src}
        >
          {layer.src}
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
    </PanelHeader>
  );
  if (!layer || !("src" in layer)) {
    return (
      <>
        {header}
        <p className="grid flex-1 place-items-center p-3 text-center text-xs text-neutral-500">
          Select a video, audio, or image layer to preview its source.
        </p>
      </>
    );
  }
  const src = resolveMediaUrl(layer.src);
  const onError = () => setFailed(true);
  return (
    <>
      {header}
      {failed && (
        <p role="alert" className="px-3 pt-3 text-xs text-destructive">
          Could not load {layer.src}. Check that the file exists and your
          browser supports its format.
        </p>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {layer.type === "video" && (
          <video
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
    </>
  );
}
