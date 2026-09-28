import type { Project } from "./project.ts";

export type EditorProjectFile = { file: string; project: Project };

/** A project file found under the projects root, as `<cover>/<name>.json`. */
export type ProjectEntry = {
  path: string;
  width: number;
  height: number;
  output: Project["output"]["type"];
};

export type ProjectList = { root: string; projects: ProjectEntry[] };

/**
 * The project file URL from the page's `?project=` query. Switching projects
 * is a page navigation, so it stays fixed for the page's lifetime.
 */
export function getProjectUrl(): string | undefined {
  return (
    new URLSearchParams(window.location.search).get("project") ?? undefined
  );
}

/** The editor URL that opens a listed project. */
export function projectPageUrl({ path }: { path: string }) {
  return `?project=/files/${encodeURI(path)}`;
}

export const editorProjectStorage = {
  async list(): Promise<ProjectList> {
    const res = await fetch("/api/projects");
    if (!res.ok) {
      throw new Error(`Failed to list projects: ${await res.text()}`);
    }
    return res.json();
  },

  async load({ url }: { url: string }): Promise<EditorProjectFile> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load project: ${await res.text()}`);
    }
    return { file: url, project: await res.json() };
  },

  async save({ url, project }: { url: string; project: Project }) {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    if (!res.ok) {
      throw new Error(`Failed to save project: ${await res.text()}`);
    }
  },
};
