/** A layer type backed by a media file. */
export type MediaType = "video" | "audio" | "image";

/** A file in a project's `media/` folder, named by its `src` relative to the project. */
export type MediaFile = { src: string; type: MediaType };

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
