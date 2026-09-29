import { useCallback, useState, type CSSProperties } from "react";
import { fitBox } from "../lib/layout";
import type { ImageLayer, VideoLayer } from "../lib/project";
import type { EditorRuntime } from "../lib/runtime";

/** Fit the cropped source into its canvas box after the browser reads its dimensions. */
export function CompositionMedia({
  layer,
  runtime,
  index,
  resolveMediaUrl,
}: {
  layer: ImageLayer | VideoLayer;
  runtime: EditorRuntime;
  index: number;
  resolveMediaUrl: (src: string) => string;
}) {
  const [source, setSource] = useState<{ width: number; height: number }>();
  const [failed, setFailed] = useState(false);

  const crop = layer.crop ?? {};
  const fit = source && fitBox({ source, crop, box: layer.box });
  const mediaStyle: CSSProperties | undefined =
    source && fit
      ? {
          position: "absolute",
          maxWidth: "none",
          width:
            (source.width * fit.width) /
            (source.width * (1 - (crop.left ?? 0) - (crop.right ?? 0))),
          height:
            (source.height * fit.height) /
            (source.height * (1 - (crop.top ?? 0) - (crop.bottom ?? 0))),
          left:
            (-(crop.left ?? 0) * fit.width) /
            (1 - (crop.left ?? 0) - (crop.right ?? 0)),
          top:
            (-(crop.top ?? 0) * fit.height) /
            (1 - (crop.top ?? 0) - (crop.bottom ?? 0)),
        }
      : undefined;
  return (
    <>
      {failed && (
        <p
          role="alert"
          className="absolute bg-black p-2 text-sm text-destructive"
          style={{ left: layer.box.x, top: layer.box.y }}
        >
          Could not load {layer.src}.
        </p>
      )}
      <div
        className="absolute overflow-hidden"
        style={
          fit
            ? { left: fit.x, top: fit.y, width: fit.width, height: fit.height }
            : { display: "none" }
        }
      >
        {layer.type === "video" ? (
          <CompositionVideo
            layer={layer}
            runtime={runtime}
            index={index}
            src={resolveMediaUrl(layer.src)}
            style={mediaStyle}
            onSize={setSource}
            onError={() => setFailed(true)}
          />
        ) : (
          <img
            src={resolveMediaUrl(layer.src)}
            alt={layer.name ?? layer.src}
            style={mediaStyle}
            onLoad={(event) => {
              const image = event.currentTarget;
              setSource({
                width: image.naturalWidth,
                height: image.naturalHeight,
              });
            }}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </>
  );
}

function CompositionVideo({
  layer,
  runtime,
  index,
  src,
  style,
  onSize,
  onError,
}: {
  layer: VideoLayer;
  runtime: EditorRuntime;
  index: number;
  src: string;
  style?: CSSProperties;
  onSize: (size: { width: number; height: number }) => void;
  onError: () => void;
}) {
  const playbackRef = useCallback(
    (element: HTMLVideoElement | null) =>
      element ? runtime.attachVideo({ index, element }) : undefined,
    [runtime, index],
  );
  return (
    <video
      ref={playbackRef}
      src={src}
      playsInline
      preload="auto"
      aria-label={layer.name ?? layer.src}
      style={style}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        onSize({ width: video.videoWidth, height: video.videoHeight });
      }}
      onError={onError}
    />
  );
}
