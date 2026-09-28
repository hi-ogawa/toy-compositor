import type { Project } from "./project.ts";

export type ProjectFile = { file: string; project: Project };

export async function loadProjectFile({
  url,
}: {
  url: string;
}): Promise<ProjectFile> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load project: ${await res.text()}`);
  }
  return { file: url, project: await res.json() };
}

export async function saveProjectFile({
  url,
  project,
}: {
  url: string;
  project: Project;
}): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!res.ok) {
    throw new Error(`Failed to save project: ${await res.text()}`);
  }
}

/** Resolve a layer source relative to the project file, like the renderer does. */
export function resolveProjectMediaUrl({
  src,
  projectUrl,
}: {
  src: string;
  projectUrl: string;
}): string {
  return new URL(src, projectUrl).href;
}
