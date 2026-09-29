import type { apiClient as serverApiClient } from "./api-client.ts";
import type { Project } from "./project.ts";

// The demo build uses this module in place of `api-client.ts`, so the editor
// runs as a static site over the bundled synthetic sample.

export const apiClient: typeof serverApiClient = {
  async listProjects() {
    return {
      root: "demo",
      projects: [...projects].map(([path, project]) => ({
        path,
        width: project.canvas.width,
        height: project.canvas.height,
        output: project.output.type,
      })),
    };
  },

  async loadProject({ path }) {
    const project = projects.get(path);
    if (!project) {
      throw new Error(`Failed to load project: ${path} is not in the demo`);
    }
    return { file: path, project: structuredClone(project) };
  },

  /** Saves last for the browser tab's session. */
  async saveProject({ path, project }) {
    writeProject({ path, project });
  },

  /** Creates last for the browser tab's session. */
  async createProject({ path, project }) {
    if (projects.has(path)) {
      throw new Error(`Failed to create project: ${path} already exists`);
    }
    writeProject({ path, project });
  },

  /** Every demo project sits beside the sample's `media/`, so `src` is the key. */
  getMediaUrl({ src }) {
    return mediaUrls.get(src) ?? src;
  },

  async loadAudioData({ src, projectPath }) {
    const res = await fetch(apiClient.getMediaUrl({ src, projectPath }));
    if (!res.ok) {
      throw new Error(`Failed to load audio data: ${await res.text()}`);
    }
    return res.arrayBuffer();
  },
};

// Saved and created projects are kept in session storage over the bundled
// sample, because opening a project or going home reloads the page.
const STORAGE_KEY = "toy-compositor-demo-projects";

const writtenProjects: Record<string, Project> = JSON.parse(
  sessionStorage.getItem(STORAGE_KEY) ?? "{}",
);

const projects = new Map([
  ...Object.entries(
    import.meta.glob<Project>("./*.json", {
      base: "../../samples/synthetic",
      eager: true,
      import: "default",
    }),
  ).map(
    ([key, project]) => [key.replace("./", "synthetic/"), project] as const,
  ),
  ...Object.entries(writtenProjects),
]);

function writeProject({ path, project }: { path: string; project: Project }) {
  const copy = structuredClone(project);
  projects.set(path, copy);
  writtenProjects[path] = copy;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(writtenProjects));
}

// Media is inlined as data URLs, because static hosts such as Cloudflare may
// answer range requests with the whole file, and a video cannot seek without them.
const mediaUrls = new Map(
  Object.entries(
    import.meta.glob<string>("./media/*", {
      base: "../../samples/synthetic",
      eager: true,
      query: "?inline",
      import: "default",
    }),
  ).map(([key, url]) => [key.replace("./", ""), url]),
);
