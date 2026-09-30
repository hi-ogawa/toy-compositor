import type { PromiseState } from "../utils/promise-state.ts";
import type { AudioView } from "./audio-view.ts";
import type { Layer, Project } from "./project.ts";

/**
 * The editor's runtime state for one layer, like toy-midi's recorder runtime
 * state beside its serialized form. `layer` is exactly what the project file
 * holds, and the other fields exist only while the editor runs.
 */
export type EditorLayer = {
  /** Stable for the session, through edits, but never saved. */
  id: string;
  layer: Layer;
  /** The decoded audio of a video or audio layer's source. */
  audio?: PromiseState<DecodedAudio>;
};

export interface DecodedAudio {
  buffer: AudioBuffer;
  view: AudioView;
}

export type EditorProject = Omit<Project, "layers"> & {
  layers: EditorLayer[];
};

export function deserializeEditorProject(project: Project): EditorProject {
  return {
    ...project,
    layers: project.layers.map((layer) => ({
      id: crypto.randomUUID(),
      layer,
    })),
  };
}

export function serializeEditorProject(project: EditorProject): Project {
  return {
    ...project,
    layers: project.layers.map(({ layer }) => layer),
  };
}
