import type { apiClient as serverApiClient } from "./api-client.ts";
import { getMediaType, type MediaFile } from "./media-file.ts";
import type { MediaInfo, Project } from "./project.ts";

// The demo build uses this module in place of `api-client.ts`, so the editor
// runs as a static site over the bundled synthetic sample.

export const apiClient: typeof serverApiClient = {
  /** Lists the bundled sample as one folder, and adding folders is disabled. */
  async listProjects() {
    return {
      folders: [
        {
          dir: DEMO_DIR,
          files: [...projects].map(([file, project]) => ({
            file,
            width: project.canvas.width,
            height: project.canvas.height,
            output: project.output.type,
          })),
        },
      ],
    };
  },

  async addProjectFolder() {
    throw new Error("The demo cannot add project folders.");
  },

  async pickProjectFolder() {
    throw new Error("The demo cannot add project folders.");
  },

  async removeProjectFolder() {
    throw new Error("The demo cannot remove project folders.");
  },

  async loadProject({ dir, file }) {
    const project = projects.get(file);
    if (!project) {
      throw new Error(`Failed to load project: ${file} is not in the demo`);
    }
    return { dir, file, project: structuredClone(project) };
  },

  /** Saves last for the browser tab's session. */
  async saveProject({ file, project }) {
    writeProject({ file, project });
  },

  /** Creates last for the browser tab's session. */
  async createProject({ file, project }) {
    if (projects.has(file)) {
      throw new Error(`Failed to create project: ${file} already exists`);
    }
    writeProject({ file, project });
  },

  /** Every demo project sits beside the sample's `media/`, so `src` is the key. */
  getMediaUrl({ src }) {
    return mediaUrls.get(src) ?? src;
  },

  async listMediaFiles() {
    return [...mediaUrls.keys()].flatMap((src): MediaFile[] => {
      const type = getMediaType(src);
      return type ? [{ src, type }] : [];
    });
  },

  async openMediaFolder() {
    throw new Error("The demo has no media folder to open.");
  },

  async loadMediaInfo({ src }) {
    const mediaInfo = sampleMediaInfoMap[src];
    if (!mediaInfo) {
      throw new Error(`Failed to load media info: ${src} is not in the demo`);
    }
    return mediaInfo;
  },

  async loadAudioData({ src, dir }) {
    const res = await fetch(apiClient.getMediaUrl({ src, dir }));
    if (!res.ok) {
      throw new Error(`Failed to load audio data: ${await res.text()}`);
    }
    return res.arrayBuffer();
  },
};

// The one project folder, which holds the bundled sample's project files.
const DEMO_DIR = "synthetic";

// Saved and created projects are kept in session storage over the bundled
// sample, because opening a project or going home reloads the page.
const STORAGE_KEY = "toy-compositor-demo-projects";

const writtenProjects: Record<string, Project> = JSON.parse(
  sessionStorage.getItem(STORAGE_KEY) ?? "{}",
);

const sampleProjects = Object.entries(
  import.meta.glob<Project>("./*.json", {
    base: "../../samples/synthetic",
    eager: true,
    import: "default",
  }),
).map(([key, project]) => [key.replace("./", ""), project] as const);

const projects = new Map([
  ...sampleProjects,
  ...Object.entries(writtenProjects),
]);

function writeProject({ file, project }: { file: string; project: Project }) {
  const copy = structuredClone(project);
  projects.set(file, copy);
  writtenProjects[file] = copy;
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

// The static demo has no server to probe media, so it looks files up in the
// samples' own media info.
const sampleMediaInfoMap: Record<string, MediaInfo> = Object.fromEntries(
  sampleProjects.flatMap(([, project]) => Object.entries(project.media)),
);
