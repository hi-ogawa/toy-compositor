import type { Project } from "./project.ts";
import type { EditorLayer, EditorProject } from "./runtime.ts";

export function serializeEditorProject(project: EditorProject): Project {
  return {
    ...project,
    layers: project.layers.map(({ id: _id, ...layer }) => layer),
  };
}

/** Layer ids are assigned on load, because the file is also written by hand and by agents. */
export function deserializeEditorProject(project: Project): EditorProject {
  return {
    ...project,
    layers: project.layers.map((layer): EditorLayer => ({
      ...layer,
      id: crypto.randomUUID(),
    })),
  };
}
