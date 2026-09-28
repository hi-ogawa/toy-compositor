import type { Project } from "./project.ts";

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
      apiUrl({ pathname: "/api/project", params: { path } }),
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
      apiUrl({ pathname: "/api/project", params: { path } }),
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
    return apiUrl({
      pathname: "/api/media",
      params: { project: projectPath, src },
    });
  },
};

function apiUrl({
  pathname,
  params,
}: {
  pathname: string;
  params: Record<string, string>;
}): string {
  return `${pathname}?${new URLSearchParams(params)}`;
}
