export type MediaType = "video" | "audio" | "image";

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

export function getMediaType(path: string): MediaType | undefined {
  return getMediaContentType(path)?.split("/")[0] as MediaType | undefined;
}

export function getMediaContentType(path: string): string | undefined {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension ? MEDIA_CONTENT_TYPES[extension] : undefined;
}
