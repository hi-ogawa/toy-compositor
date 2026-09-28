import type { ProjectFile, ProjectList } from "../lib/project-file.ts";
import type { Project } from "../lib/project.ts";

export { getProjectPageUrl } from "../lib/project-file.ts";
export type {
  ProjectEntry,
  ProjectFile,
  ProjectList,
} from "../lib/project-file.ts";

// The demo build swaps this module in for `lib/project-file.ts`, so the editor
// runs as a static site over the synthetic sample. Saves last until reload.
const projects = new Map(
  Object.entries(
    import.meta.glob<Project>("../../samples/synthetic/*.json", {
      eager: true,
      import: "default",
    }),
  ).map(([key, project]) => [`synthetic/${key.split("/").pop()}`, project]),
);

const mediaUrls = new Map(
  Object.entries(
    import.meta.glob<string>("../../samples/synthetic/media/*", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  ).map(([key, url]) => [`media/${key.split("/").pop()}`, url]),
);

export async function listProjectFiles(): Promise<ProjectList> {
  return {
    root: "demo",
    projects: [...projects].map(([path, project]) => ({
      path,
      width: project.canvas.width,
      height: project.canvas.height,
      output: project.output.type,
    })),
  };
}

export async function loadProjectFile({
  path,
}: {
  path: string;
}): Promise<ProjectFile> {
  const project = projects.get(path);
  if (!project) {
    throw new Error(`Failed to load project: ${path} is not in the demo`);
  }
  return { file: path, project: structuredClone(project) };
}

export async function saveProjectFile({
  path,
  project,
}: {
  path: string;
  project: Project;
}): Promise<void> {
  projects.set(path, structuredClone(project));
}

/** Every demo project sits beside the sample's `media/`, so `src` maps directly. */
export function resolveProjectMediaUrl({ src }: { src: string }): string {
  return mediaUrls.get(src) ?? src;
}
