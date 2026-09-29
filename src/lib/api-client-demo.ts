import type { apiClient as serverApiClient } from "./api-client.ts";
import { getMediaType, type MediaFile, type MediaInfo } from "./media.ts";
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

  /** Saves last until the page reloads. */
  async saveProject({ path, project }) {
    projects.set(path, structuredClone(project));
  },

  /** Every demo project sits beside the sample's `media/`, so `src` is the key. */
  getMediaUrl({ src }) {
    return mediaUrls.get(src) ?? src;
  },

  async listMediaFiles() {
    return [...mediaUrls.keys()].flatMap((path): MediaFile[] => {
      const type = getMediaType(path);
      return type ? [{ path, type }] : [];
    });
  },

  async openMediaFolder() {
    throw new Error("The demo has no media folder to open.");
  },

  async loadMediaInfo({ src }) {
    const info = mediaInfos[src];
    if (!info) {
      throw new Error(`Failed to load media info: ${src} is not in the demo`);
    }
    return info;
  },

  async loadAudioData({ src, projectPath }) {
    const res = await fetch(apiClient.getMediaUrl({ src, projectPath }));
    if (!res.ok) {
      throw new Error(`Failed to load audio data: ${await res.text()}`);
    }
    return res.arrayBuffer();
  },
};

const projects = new Map(
  Object.entries(
    import.meta.glob<Project>("./*.json", {
      base: "../../samples/synthetic",
      eager: true,
      import: "default",
    }),
  ).map(([key, project]) => [key.replace("./", "synthetic/"), project]),
);

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

// What the server's ffprobe reports for the committed synthetic media, because
// the static demo has no server to probe it.
const mediaInfos: Record<string, MediaInfo> = {
  "media/video.mp4": {
    type: "video",
    start: 0,
    end: 3,
    width: 320,
    height: 180,
  },
  "media/audio.wav": { type: "audio", start: 0, end: 3 },
  "media/image.png": { type: "image", width: 160, height: 90 },
};
