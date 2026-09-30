import type { Project } from "./project.ts";
import type { EditorLayer, EditorLocator, EditorProject } from "./runtime.ts";

export function serializeEditorProject(project: EditorProject): Project {
  return {
    ...project,
    layers: project.layers.map(({ id: _id, ...layer }) => layer),
    locators: project.locators?.map(({ id: _id, ...locator }) => locator),
  };
}

export function deserializeEditorProject(project: Project): EditorProject {
  return {
    ...project,
    layers: project.layers.map((layer): EditorLayer => ({
      ...layer,
      id: crypto.randomUUID(),
    })),
    locators: project.locators?.map((locator): EditorLocator => ({
      ...locator,
      id: crypto.randomUUID(),
    })),
  };
}
