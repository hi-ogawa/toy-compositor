import type { ProjectFile, ProjectList } from "../lib/project-file.ts";
import type { Project } from "../lib/project.ts";

// The demo build uses this module in place of `lib/project-file.ts`, so the
// editor runs as a static site over the bundled synthetic sample.

export { getProjectPageUrl } from "../lib/project-file.ts";

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

/** Saves last until the page reloads. */
export async function saveProjectFile({
  path,
  project,
}: {
  path: string;
  project: Project;
}): Promise<void> {
  projects.set(path, structuredClone(project));
}

/** Every demo project sits beside the sample's `media/`, so `src` is the key. */
export function resolveProjectMediaUrl({ src }: { src: string }): string {
  return mediaUrls.get(src) ?? src;
}

const projects = new Map(
  Object.entries(
    import.meta.glob<Project>("./*.json", {
      base: "../../samples/synthetic",
      eager: true,
      import: "default",
    }),
  ).map(([key, project]) => [key.replace("./", "synthetic/"), project]),
);

// Static hosts such as Cloudflare may answer range requests with the whole
// file, and a video cannot seek without ranges, so media is served from blobs.
const mediaUrls = new Map(
  await Promise.all(
    Object.entries(
      import.meta.glob<string>("./media/*", {
        base: "../../samples/synthetic",
        eager: true,
        query: "?url",
        import: "default",
      }),
    ).map(async ([key, url]): Promise<[string, string]> => {
      const blob = await (await fetch(url)).blob();
      return [key.replace("./", ""), URL.createObjectURL(blob)];
    }),
  ),
);
