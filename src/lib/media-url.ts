export function mediaUrl(src: string) {
  return `/api/media/${src.split("/").map(encodeURIComponent).join("/")}`;
}
