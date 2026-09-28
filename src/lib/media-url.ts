/** Resolve a layer source relative to the project file, like the renderer does. */
export function resolveMediaUrl({
  src,
  projectUrl,
}: {
  src: string;
  projectUrl: string;
}) {
  return new URL(src, projectUrl).href;
}
