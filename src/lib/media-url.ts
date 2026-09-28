import { getProjectUrl } from "./project-storage";

/** Resolve a layer source relative to the project file, like the renderer does. */
export function mediaUrl(src: string) {
  const projectUrl = new URL(getProjectUrl()!, window.location.href);
  return new URL(src, projectUrl).href;
}
