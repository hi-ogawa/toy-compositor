import type { Project } from "./project.ts";
import type { EditorLayer, PersistableEditorState } from "./runtime.ts";

export function serializeEditorState(state: PersistableEditorState): Project {
  return {
    canvas: state.canvas,
    output: state.output,
    layers: state.layers.map(({ id: _id, ...layer }) => layer),
    locators: state.locators,
    media: state.media,
  };
}

/** Layer ids are assigned on load, because the file is also written by hand and by agents. */
export function deserializeEditorState(
  project: Project,
): PersistableEditorState {
  return {
    canvas: project.canvas,
    output: project.output,
    layers: project.layers.map((layer): EditorLayer => ({
      ...layer,
      id: crypto.randomUUID(),
    })),
    locators: project.locators,
    media: project.media,
  };
}
