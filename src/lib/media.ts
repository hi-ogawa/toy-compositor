/** A layer type backed by a media file. */
export type MediaType = "video" | "audio" | "image";

/** A file in a project's `media/` folder, named by its path relative to the project, like a layer's `src`. */
export type MediaFile = { path: string; type: MediaType };

/**
 * What adding and editing a layer needs to know about its source. `start` and
 * `end` bound its source times, the same presentation timestamps as a layer's
 * `in` and `out`, so they include the stream's start offset.
 */
export type MediaInfo =
  | { type: "video"; start: number; end: number; width: number; height: number }
  | { type: "audio"; start: number; end: number }
  | { type: "image"; width: number; height: number };

const MEDIA_TYPES: Record<string, MediaType> = {
  mp4: "video",
  mov: "video",
  mkv: "video",
  webm: "video",
  wav: "audio",
  mp3: "audio",
  flac: "audio",
  m4a: "audio",
  aac: "audio",
  ogg: "audio",
  opus: "audio",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
};

/** Guess a file's media type from its extension, or undefined for other files. */
export function getMediaType(path: string): MediaType | undefined {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension ? MEDIA_TYPES[extension] : undefined;
}
