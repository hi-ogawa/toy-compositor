import type { MediaFile } from "./media-file.ts";
import type { MediaInfo, Output, Project } from "./project.ts";

/** A project file, named by its folder's absolute path and its name in that folder. */
export type ProjectLocation = { dir: string; file: string };

export type ProjectFile = ProjectLocation & { project: Project };

/** A project file in a project folder, as `<name>.json`. */
export type ProjectEntry = {
  file: string;
  width: number;
  height: number;
  output: Output["type"];
};

/** A registered project folder with its project files, or `missing` when it no longer exists. */
export type ProjectFolder = {
  dir: string;
  missing?: boolean;
  files: ProjectEntry[];
};

/**
 * The registered project folders. `add` is absent when folders cannot be
 * added, and names the native dialog that the server can open when it has one.
 */
export type ProjectList = {
  folders: ProjectFolder[];
  add?: { dialog?: "zenity" | "osascript" };
};

/** Client for the editor server's `/api/` routes. */
export const apiClient = {
  async listProjects(): Promise<ProjectList> {
    const res = await fetch("/api/projects");
    if (!res.ok) {
      throw new Error(`Failed to list projects: ${await res.text()}`);
    }
    return res.json();
  },

  /** Registers a folder, or the folder of a project file inside it, by path. */
  async addProjectFolder({ path }: { path: string }): Promise<void> {
    const res = await fetch("/api/project-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      throw new Error(`Failed to add project folder: ${await res.text()}`);
    }
  },

  /** Registers a folder or project file picked in the server desktop's native dialog. */
  async pickProjectFolder({
    kind,
  }: {
    kind: "folder" | "file";
  }): Promise<void> {
    const res = await fetch(
      getApiUrl({ pathname: "/api/pick-project-folder", params: { kind } }),
      { method: "POST" },
    );
    if (!res.ok) {
      throw new Error(`Failed to add project folder: ${await res.text()}`);
    }
  },

  /** Forgets a project folder without deleting its files. */
  async removeProjectFolder({ dir }: { dir: string }): Promise<void> {
    const res = await fetch(
      getApiUrl({ pathname: "/api/project-folders", params: { project: dir } }),
      { method: "DELETE" },
    );
    if (!res.ok) {
      throw new Error(`Failed to remove project folder: ${await res.text()}`);
    }
  },

  async loadProject({ dir, file }: ProjectLocation): Promise<ProjectFile> {
    const res = await fetch(
      getApiUrl({ pathname: "/api/project", params: { project: dir, file } }),
    );
    if (!res.ok) {
      throw new Error(`Failed to load project: ${await res.text()}`);
    }
    return { dir, file, project: await res.json() };
  },

  async saveProject({
    dir,
    file,
    project,
  }: ProjectLocation & { project: Project }): Promise<void> {
    const res = await fetch(
      getApiUrl({ pathname: "/api/project", params: { project: dir, file } }),
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
    dir,
    file,
    project,
  }: ProjectLocation & { project: Project }): Promise<void> {
    const res = await fetch(
      getApiUrl({ pathname: "/api/project", params: { project: dir, file } }),
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
   * The server resolves a layer source against the project folder, as the
   * renderer does, so `src` is a file path everywhere.
   */
  getMediaUrl({ src, dir }: { src: string; dir: string }): string {
    return getApiUrl({
      pathname: "/api/media",
      params: { project: dir, src },
    });
  },

  async listMediaFiles({ dir }: { dir: string }): Promise<MediaFile[]> {
    const res = await fetch(
      getApiUrl({
        pathname: "/api/media-files",
        params: { project: dir },
      }),
    );
    if (!res.ok) {
      throw new Error(`Failed to list media files: ${await res.text()}`);
    }
    return (await res.json()).files;
  },

  async openMediaFolder({ dir }: { dir: string }): Promise<void> {
    const res = await fetch(
      getApiUrl({
        pathname: "/api/open-media-folder",
        params: { project: dir },
      }),
      { method: "POST" },
    );
    if (!res.ok) {
      throw new Error(`Failed to open the media folder: ${await res.text()}`);
    }
  },

  async loadMediaInfo({
    src,
    dir,
  }: {
    src: string;
    dir: string;
  }): Promise<MediaInfo> {
    const res = await fetch(
      getApiUrl({
        pathname: "/api/media-info",
        params: { project: dir, src },
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
    dir,
  }: {
    src: string;
    dir: string;
  }): Promise<ArrayBuffer> {
    const res = await fetch(apiClient.getMediaUrl({ src, dir }));
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
