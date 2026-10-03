import { useCallback, useState, type CSSProperties } from "react";
import { fitBox } from "../lib/layout";
import type { ImageClip, MediaInfo, VideoClip } from "../lib/project";
import type { EditorRuntime } from "../lib/runtime";

/** Fit the cropped source into its canvas box, by the size its media info records. */
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
  const crop = clip.crop ?? {};
  const fit = fitBox({ source: video, crop, box: clip.box });
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
          style={{ left: clip.box.x, top: clip.box.y }}
        >
          Could not load {clip.src}.
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
