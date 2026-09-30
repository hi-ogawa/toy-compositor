import type { ProjectLocation } from "./server/api.ts";

/** Get the start page URL that lists the project folders. */
export function getHomePageUrl(): string {
  return "./";
}

/** Get the editor page URL that opens a project file. */
export function getProjectPageUrl({ dir, file }: ProjectLocation): string {
  return `?${new URLSearchParams({ project: dir, file })}`;
}
