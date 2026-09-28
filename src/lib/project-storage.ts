import type { Project } from "./project.ts";

export type EditorProjectFile = { file: string; project: Project };

/**
 * The project file URL from the page's `?project=` query. Switching projects
 * is a page navigation, so it stays fixed for the page's lifetime.
 */
export function getProjectUrl(): string | undefined {
  return (
    new URLSearchParams(window.location.search).get("project") ?? undefined
  );
}

export const editorProjectStorage = {
  async load({ url }: { url: string }): Promise<EditorProjectFile> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load project: ${await res.text()}`);
    }
    return { file: url, project: await res.json() };
  },

  async save({ url, project }: { url: string; project: Project }) {
    // Only the dev server writes files. Static hosts may answer PUT like GET,
    // which would look like a successful save.
    if (!import.meta.env.DEV) {
      throw new Error(
        "This build is read-only. Run pnpm dev to save project edits.",
      );
    }
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
