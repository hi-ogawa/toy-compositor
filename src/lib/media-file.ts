/** A layer type backed by a media file. */
export type MediaType = "video" | "audio" | "image";

/** A file in a project's `media/` folder, named by its `src` relative to the project. */
export type MediaFile = { src: string; type: MediaType };

const MEDIA_CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Guess a file's media type from its extension, or undefined for other files. */
export function getMediaType(path: string): MediaType | undefined {
  return getMediaContentType(path)?.split("/")[0] as MediaType | undefined;
}

/** Guess a media file's MIME type from its extension, or undefined for other files. */
export function getMediaContentType(path: string): string | undefined {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension ? MEDIA_CONTENT_TYPES[extension] : undefined;
}
