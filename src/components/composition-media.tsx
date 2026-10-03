import { useCallback, useState, type CSSProperties } from "react";
import { getVisibleBox } from "../lib/layout";
import type { ImageClip, MediaInfo, VideoClip } from "../lib/project";
import type { EditorRuntime } from "../lib/runtime";

/** Place the cropped source on the canvas, by the size its media info records. */
export function CompositionMedia({
  clip,
  name,
  mediaInfo,
  runtime,
  id,
  resolveMediaUrl,
}: {
  clip: ImageClip | VideoClip;
  /** The layer's name, which labels the media element. */
  name: string;
  mediaInfo: MediaInfo;
  runtime: EditorRuntime;
  id: string;
  resolveMediaUrl: (src: string) => string;
}) {
  const [failed, setFailed] = useState(false);

  const video = mediaInfo.video!;
  const { crop } = clip;
  const visible = getVisibleBox({
    size: video,
    crop,
    transform: clip.transform,
  });
  const mediaStyle: CSSProperties = {
    position: "absolute",
    maxWidth: "none",
    width:
      (video.width * visible.width) /
      (video.width * (1 - crop.left - crop.right)),
    height:
      (video.height * visible.height) /
      (video.height * (1 - crop.top - crop.bottom)),
    left: (-crop.left * visible.width) / (1 - crop.left - crop.right),
    top: (-crop.top * visible.height) / (1 - crop.top - crop.bottom),
  };
  return (
    <>
      {failed && (
        <p
          role="alert"
          className="absolute bg-black p-2 text-sm text-destructive"
          style={{ left: visible.x, top: visible.y }}
        >
          Could not load {clip.src}.
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
        {clip.type === "video" ? (
          <CompositionVideo
            name={name}
            runtime={runtime}
            id={id}
            src={resolveMediaUrl(clip.src)}
            style={mediaStyle}
            onError={() => setFailed(true)}
          />
        ) : (
          <img
            src={resolveMediaUrl(clip.src)}
            alt={name}
            style={mediaStyle}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </>
  );
}

function CompositionVideo({
  name,
  runtime,
  id,
  src,
  style,
  onError,
}: {
  name: string;
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
      aria-label={name}
      style={style}
      onError={onError}
    />
  );
}
