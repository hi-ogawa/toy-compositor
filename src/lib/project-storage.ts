// The project is a JSON file on disk, loaded and saved through src/lib/server/api.ts.

import type { Project } from "./project.ts";

export type EditorProjectFile = { file: string; project: Project };

export const editorProjectStorage = {
  async load(): Promise<EditorProjectFile> {
    const res = await fetch("/api/project");
    if (!res.ok) {
      throw new Error(`Failed to load project: ${await res.text()}`);
    }
    return res.json();
  },

  async save(project: Project): Promise<void> {
    const res = await fetch("/api/project", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    if (!res.ok) {
      throw new Error(`Failed to save project: ${await res.text()}`);
    }
  },
};
