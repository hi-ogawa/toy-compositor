import type { Project } from "./project.ts";

export type EditorProjectFile = { file: string; project: Project };

export const editorProjectStorage = {
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
