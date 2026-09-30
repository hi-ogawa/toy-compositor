import type { MediaFile } from "./media-file.ts";
import type { MediaInfo, Project } from "./project.ts";

export type ProjectFile = { file: string; project: Project };

/** A project file found under the projects root, as `<project-dir>/<name>.json`. */
export type ProjectEntry = {
  path: string;
  width: number;
  height: number;
  output: Project["output"]["type"];
};

export type ProjectList = { root: string; projects: ProjectEntry[] };

/** Client for the editor server's `/api/` routes. */
export const apiClient = {
  async listProjects(): Promise<ProjectList> {
    const res = await fetch("/api/projects");
    if (!res.ok) {
      throw new Error(`Failed to list projects: ${await res.text()}`);
    }
    return res.json();
  },

  async loadProject({ path }: { path: string }): Promise<ProjectFile> {
    const res = await fetch(
      getApiUrl({ pathname: "/api/project", params: { path } }),
    );
    if (!res.ok) {
      throw new Error(`Failed to load project: ${await res.text()}`);
    }
    return { file: path, project: await res.json() };
  },

  async saveProject({
    path,
    project,
  }: {
    path: string;
    project: Project;
  }): Promise<void> {
    const res = await fetch(
      getApiUrl({ pathname: "/api/project", params: { path } }),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      },
    );
    if (!res.ok) {
      throw new Error(`Failed to save project: ${await res.text()}`);
    }
  },

  /** Creates a project file, failing if it already exists. */
  async createProject({
    path,
    project,
  }: {
    path: string;
    project: Project;
  }): Promise<void> {
    const res = await fetch(
      getApiUrl({ pathname: "/api/project", params: { path } }),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      },
    );
    if (!res.ok) {
      throw new Error(`Failed to create project: ${await res.text()}`);
    }
  },

  /**
   * The server resolves a layer source against the project's directory, as the
   * renderer does, so `src` is a file path everywhere.
   */
  getMediaUrl({
    src,
    projectPath,
  }: {
    src: string;
    projectPath: string;
  }): string {
    return getApiUrl({
      pathname: "/api/media",
      params: { project: projectPath, src },
    });
  },

  /** Lists the media files in the project's `media/` folder. */
  async listMediaFiles({
    projectPath,
  }: {
    projectPath: string;
  }): Promise<MediaFile[]> {
    const res = await fetch(
      getApiUrl({
        pathname: "/api/media-files",
        params: { project: projectPath },
      }),
    );
    if (!res.ok) {
      throw new Error(`Failed to list media files: ${await res.text()}`);
    }
    return (await res.json()).files;
  },

  /** Opens the project's `media/` folder in the server desktop's file manager. */
  async openMediaFolder({
    projectPath,
  }: {
    projectPath: string;
  }): Promise<void> {
    const res = await fetch(
      getApiUrl({
        pathname: "/api/open-media-folder",
        params: { project: projectPath },
      }),
      { method: "POST" },
    );
    if (!res.ok) {
      throw new Error(`Failed to open the media folder: ${await res.text()}`);
    }
  },

  /** Probes a media file on the server into the entry that the project's `media` keeps for it. */
  async loadMediaInfo({
    src,
    projectPath,
  }: {
    src: string;
    projectPath: string;
  }): Promise<MediaInfo> {
    const res = await fetch(
      getApiUrl({
        pathname: "/api/media-info",
        params: { project: projectPath, src },
      }),
    );
    if (!res.ok) {
      throw new Error(`Failed to load media info: ${await res.text()}`);
    }
    return res.json();
  },

  /** Fetches a video or audio source's encoded bytes for decoding its audio. */
  async loadAudioData({
    src,
    projectPath,
  }: {
    src: string;
    projectPath: string;
  }): Promise<ArrayBuffer> {
    const res = await fetch(apiClient.getMediaUrl({ src, projectPath }));
    if (!res.ok) {
      throw new Error(`Failed to load audio data: ${await res.text()}`);
    }
    return res.arrayBuffer();
  },
};

function getApiUrl({
  pathname,
  params,
}: {
  pathname: string;
  params: Record<string, string>;
}): string {
  return `${pathname}?${new URLSearchParams(params)}`;
}
