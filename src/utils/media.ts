/** Reads a media file's duration from a detached element's metadata, without downloading the rest of the file. */
export function loadMediaDuration(url: string): Promise<number> {
  const element = document.createElement("video");
  element.preload = "metadata";
  return new Promise<number>((resolve, reject) => {
    element.addEventListener("loadedmetadata", () => resolve(element.duration));
    element.addEventListener("error", () => reject(element.error));
    element.src = url;
  }).finally(() => {
    // Detaching the source aborts the element's download.
    element.removeAttribute("src");
    element.load();
  });
}
