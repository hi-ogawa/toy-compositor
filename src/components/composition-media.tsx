import { useCallback, useState, type CSSProperties } from "react";
import { getCroppedSize, getVisibleBox } from "../lib/layout";
import type { ImageLayer, MediaInfo, VideoLayer } from "../lib/project";
import type { EditorRuntime } from "../lib/runtime";

/** Place the cropped source on the canvas, by the size its media info records. */
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
  const visible = getVisibleBox({
    size: video,
    crop,
    transform: layer.transform,
  });
  // The wrapper is the visible cropped rectangle, and the media inside keeps
  // its uncropped size at the same scale, shifted by the left and top crop.
  const cropped = getCroppedSize({ size: video, crop });
  const scaleX = visible.width / cropped.width;
  const scaleY = visible.height / cropped.height;
  const mediaStyle: CSSProperties = {
    position: "absolute",
    maxWidth: "none",
    width: video.width * scaleX,
    height: video.height * scaleY,
    left: -(crop.left ?? 0) * video.width * scaleX,
    top: -(crop.top ?? 0) * video.height * scaleY,
  };
  return (
    <>
      {failed && (
        <p
          role="alert"
          className="absolute bg-black p-2 text-sm text-destructive"
          style={{ left: visible.x, top: visible.y }}
        >
          Could not load {layer.src}.
        </p>
      )}
      <div
        className="absolute overflow-hidden"
        style={{
          left: visible.x,
          top: visible.y,
          width: visible.width,
          height: visible.height,
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
