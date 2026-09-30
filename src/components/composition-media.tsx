import { useCallback, useState, type CSSProperties } from "react";
import { fitBox } from "../lib/layout";
import type { ImageLayer, MediaInfo, VideoLayer } from "../lib/project";
import type { EditorRuntime } from "../lib/runtime";

/** Fit the cropped source into its canvas box, by the size its media info records. */
export function CompositionMedia({
  layer,
  mediaInfo,
  runtime,
  id,
  resolveMediaUrl,
}: {
  layer: ImageLayer | VideoLayer;
  mediaInfo: MediaInfo;
  runtime: EditorRuntime;
  id: string;
  resolveMediaUrl: (src: string) => string;
}) {
  const [failed, setFailed] = useState(false);

  const video = mediaInfo.video!;
  const crop = layer.crop ?? {};
  const fit = fitBox({ source: video, crop, box: layer.box });
  const mediaStyle: CSSProperties = {
    position: "absolute",
    maxWidth: "none",
    width:
      (video.width * fit.width) /
      (video.width * (1 - (crop.left ?? 0) - (crop.right ?? 0))),
    height:
      (video.height * fit.height) /
      (video.height * (1 - (crop.top ?? 0) - (crop.bottom ?? 0))),
    left:
      (-(crop.left ?? 0) * fit.width) /
      (1 - (crop.left ?? 0) - (crop.right ?? 0)),
    top:
      (-(crop.top ?? 0) * fit.height) /
      (1 - (crop.top ?? 0) - (crop.bottom ?? 0)),
  };
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
        style={{
          left: fit.x,
          top: fit.y,
          width: fit.width,
          height: fit.height,
        }}
      >
        {layer.type === "video" ? (
          <CompositionVideo
            layer={layer}
            runtime={runtime}
            id={id}
            src={resolveMediaUrl(layer.src)}
            style={mediaStyle}
            onError={() => setFailed(true)}
          />
        ) : (
          <img
            src={resolveMediaUrl(layer.src)}
            alt={layer.name ?? layer.src}
            style={mediaStyle}
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
  id,
  src,
  style,
  onError,
}: {
  layer: VideoLayer;
  runtime: EditorRuntime;
  id: string;
  src: string;
  style: CSSProperties;
  onError: () => void;
}) {
  const playbackRef = useCallback(
    (element: HTMLVideoElement | null) =>
      element ? runtime.attachVideo({ id, element }) : undefined,
    [runtime, id],
  );
  return (
    <video
      ref={playbackRef}
      src={src}
      playsInline
      preload="auto"
      aria-label={layer.name ?? layer.src}
      style={style}
      onError={onError}
    />
  );
}
