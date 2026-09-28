import { createStore } from "../utils/store.ts";
import type { ProjectFile } from "./api-client.ts";
import { outputRange } from "./layout.ts";
import type { Layer, Project } from "./project.ts";
import { AudioContextTransport } from "./transport.ts";

export type EditorSelection =
  | { type: "output" }
  | { type: "layer"; index: number };

export interface EditorState {
  /** Project file path relative to the projects root, which is also where saves go. */
  file: string;
  project: Project;
  /** Follows the transport, on the frame grid whenever playback is stopped. */
  playhead: number;
  playing: boolean;
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
    playing: false,
    selection: undefined,
  }));

  readonly context = new AudioContext();
  readonly transport = new AudioContextTransport(this.context);

  constructor() {
    this.transport.store.subscribe(() => {
      const { position, isPlaying } = this.transport.store.get();
      this.store.update({ playhead: position, playing: isPlaying });
    });
  }

  select(selection: EditorSelection | undefined): void {
    this.store.update({ selection });
  }

  seek({ time }: { time: number }): void {
    const { project } = this.store.get();
    this.transport.seek(
      Number(
        (Math.round(time * project.canvas.fps) / project.canvas.fps).toFixed(3),
      ),
    );
  }

  /** Steps the playhead by whole frames. */
  seekFrames({ frames }: { frames: number }): void {
    const { project, playhead } = this.store.get();
    this.seek({ time: playhead + frames / project.canvas.fps });
  }

  async togglePlayback(): Promise<void> {
    if (this.store.get().playing) {
      this.transport.pause();
      // Land on a frame, so the paused preview matches a rendered frame.
      this.seek({ time: this.store.get().playhead });
    } else {
      // Play is a user gesture, which lets the context start running.
      await this.context.resume();
      this.transport.play();
    }
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
    this.store.update({ file, project, selection: undefined });
    this.seek({ time: outputRange(project).start });
  }

  subscribePersistableState(listener: () => void): () => void {
    return this.store.subscribeWithSelector({
      selector: (state) => state.project,
      listener,
    });
  }
}
