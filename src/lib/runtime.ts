import { createStore } from "../utils/store.ts";
import { outputRange } from "./layout.ts";
import type { ProjectFile } from "./project-file.ts";
import type { Layer, Project } from "./project.ts";

export type EditorSelection =
  | { type: "output" }
  | { type: "layer"; index: number };

export interface EditorState {
  /** Project file path relative to the projects root, which is also where saves go. */
  file: string;
  project: Project;
  playhead: number;
  selection?: EditorSelection;
}

const EMPTY_PROJECT: Project = {
  canvas: { width: 1920, height: 1080, fps: 30 },
  output: { type: "video", start: 0, end: 0 },
  layers: [],
};

export class EditorRuntime {
  readonly store = createStore<EditorState>(() => ({
    file: "",
    project: EMPTY_PROJECT,
    playhead: 0,
    selection: undefined,
  }));

  select(selection: EditorSelection | undefined): void {
    this.store.update({ selection });
  }

  seek({ time }: { time: number }): void {
    const { project } = this.store.get();
    const playhead = Number(
      (Math.round(time * project.canvas.fps) / project.canvas.fps).toFixed(3),
    );
    this.store.update({ playhead });
  }

  updateLayer({
    index,
    update,
  }: {
    index: number;
    update: Partial<Layer>;
  }): void {
    const { project } = this.store.get();
    this.store.update({
      project: {
        ...project,
        layers: project.layers.map((layer, i) =>
          i === index ? ({ ...layer, ...update } as Layer) : layer,
        ),
      },
    });
  }

  setOutput(output: Project["output"]): void {
    const { project } = this.store.get();
    this.store.update({ project: { ...project, output } });
  }

  serializeProject(): Project {
    return this.store.get().project;
  }

  deserializeProject({ file, project }: ProjectFile): void {
    this.store.update({
      file,
      project,
      playhead: outputRange(project).start,
      selection: undefined,
    });
  }

  subscribePersistableState(listener: () => void): () => void {
    return this.store.subscribeWithSelector({
      selector: (state) => state.project,
      listener,
    });
  }
}
