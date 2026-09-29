import { trackPromise, type PromiseState } from "../utils/promise-state.ts";
import { createStore, shallowEqual } from "../utils/store.ts";
import { apiClient, type ProjectFile } from "./api-client.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import {
  deserializeEditorProject,
  serializeEditorProject,
  type EditorLayer,
  type EditorProject,
} from "./editor-project.ts";
import { getOutputRange } from "./layout.ts";
import type { Layer, Project } from "./project.ts";
import { AudioContextTransport } from "./transport.ts";
import { VideoPlayback } from "./video-playback.ts";

export type EditorSelection =
  | { type: "output" }
  | { type: "layer"; id: string };

export interface EditorState {
  /** Project file path relative to the projects root, which is also where saves go. */
  file: string;
  project: EditorProject;
  /** Follows the transport, on the frame grid whenever playback is stopped. */
  playhead: number;
  playing: boolean;
  selection?: EditorSelection;
}

const EMPTY_PROJECT: EditorProject = {
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
  /** Shares one decode between the layers that use a source. */
  private readonly audioLoads = new Map<string, Promise<AudioBuffer>>();
  /** Keyed by layer id. */
  private readonly audioPlaybacks = new Map<string, AudioBufferPlayback>();
  /** Keyed by layer id. */
  private readonly videoPlaybacks = new Map<string, VideoPlayback>();

  constructor() {
    this.transport.store.subscribe(() => {
      const { position, isPlaying } = this.transport.store.get();
      this.store.update({ playhead: position, playing: isPlaying });
    });
  }

  async togglePlayback(): Promise<void> {
    if (this.store.get().playing) {
      this.transport.pause();
      // Land on a frame, so the paused preview matches a rendered frame.
      this.seek(this.store.get().playhead);
    } else {
      await this.context.resume();
      this.transport.play();
    }
  }

  seek(time: number): void {
    const { project } = this.store.get();
    const frame = Math.max(0, Math.round(time * project.canvas.fps));
    this.transport.seek(Number((frame / project.canvas.fps).toFixed(3)));
  }

  /** Steps the playhead by whole frames. */
  seekFrames(frames: number): void {
    const { project, playhead } = this.store.get();
    this.seek(playhead + frames / project.canvas.fps);
  }

  updateLayer({ id, update }: { id: string; update: Partial<Layer> }): void {
    this.reschedulePlayback(() => {
      const entry = this.getLayer(id);
      const layer = { ...entry.layer, ...update } as Layer;
      this.updateEditorLayer({ id, update: { layer } });
      // A replaced source loads afresh, instead of keeping the old audio.
      if (
        (layer.type === "video" || layer.type === "audio") &&
        "src" in entry.layer &&
        layer.src !== entry.layer.src
      ) {
        this.loadLayerAudio({ id, src: layer.src });
      }
      this.syncPlayback();
    });
  }

  setCanvas(canvas: Project["canvas"]): void {
    const { project } = this.store.get();
    this.store.update({ project: { ...project, canvas } });
  }

  setOutput(output: Project["output"]): void {
    const { project } = this.store.get();
    this.store.update({ project: { ...project, output } });
  }

  select(selection: EditorSelection | undefined): void {
    this.store.update({ selection });
  }

  /**
   * Makes a composition `<video>` follow the transport as the video layer
   * `id`, like toy-midi's `attachYouTubePlayer`. Returns its detacher.
   */
  attachVideo({
    id,
    element,
  }: {
    id: string;
    element: HTMLVideoElement;
  }): () => void {
    const playback = new VideoPlayback({ transport: this.transport, element });
    this.videoPlaybacks.set(id, playback);
    this.syncPlayback();
    return () => {
      playback.dispose();
      if (this.videoPlaybacks.get(id) === playback) {
        this.videoPlaybacks.delete(id);
      }
    };
  }

  /**
   * Applies a change that playback must reschedule for, restarting the
   * transport around it like toy-midi's `updateClips`, because participants
   * only ever start at the transport's playback anchor.
   */
  private reschedulePlayback(change: () => void): void {
    const wasPlaying = this.transport.store.get().isPlaying;
    this.transport.pause();
    change();
    if (wasPlaying) {
      this.transport.play();
    }
  }

  private syncPlayback(): void {
    const { layers } = this.store.get().project;
    for (const [id, playback] of this.videoPlaybacks) {
      const layer = layers.find((entry) => entry.id === id)?.layer;
      if (layer?.type === "video") {
        playback.setLayer({ layer });
      }
    }

    // Every video and audio layer gets a playback, and muting only decides
    // whether it schedules sound, so unmuting needs no load.
    const heard = new Set<string>();
    for (const { id, layer, audio } of layers) {
      if (layer.type !== "video" && layer.type !== "audio") {
        continue;
      }
      heard.add(id);
      let playback = this.audioPlaybacks.get(id);
      if (!playback) {
        playback = new AudioBufferPlayback({ transport: this.transport });
        this.audioPlaybacks.set(id, playback);
      }
      playback.setLayer({ layer });
      // A rejected source, such as a video file without an audio stream,
      // contributes nothing, as in the render.
      playback.setBuffer({
        buffer: audio?.status === "fulfilled" ? audio.value : undefined,
      });
    }
    for (const [id, playback] of this.audioPlaybacks) {
      if (!heard.has(id)) {
        playback.dispose();
        this.audioPlaybacks.delete(id);
      }
    }
  }

  /** Starts loading a layer's audio, which joins playback when it arrives. */
  private loadLayerAudio({ id, src }: { id: string; src: string }): void {
    const audio: PromiseState<AudioBuffer> = trackPromise({
      promise: this.loadAudio(src),
      onSettled: (settled) => {
        // Skip a load that a later source change replaced.
        if (this.findLayer(id)?.audio !== audio) {
          return;
        }
        if (settled.status === "rejected") {
          this.updateEditorLayer({ id, update: { audio: settled } });
          return;
        }
        this.reschedulePlayback(() => {
          this.updateEditorLayer({ id, update: { audio: settled } });
          this.syncPlayback();
        });
      },
    });
    this.updateEditorLayer({ id, update: { audio } });
  }

  /** Decodes a source once, however many layers use it. */
  private loadAudio(src: string): Promise<AudioBuffer> {
    let promise = this.audioLoads.get(src);
    if (!promise) {
      const decodeAudio = async () => {
        const data = await apiClient.loadAudioData({
          src,
          projectPath: this.store.get().file,
        });
        return this.context.decodeAudioData(data);
      };
      promise = decodeAudio();
      this.audioLoads.set(src, promise);
    }
    return promise;
  }

  private findLayer(id: string): EditorLayer | undefined {
    return this.store.get().project.layers.find((entry) => entry.id === id);
  }

  private getLayer(id: string): EditorLayer {
    const entry = this.findLayer(id);
    if (!entry) {
      throw new Error(`Layer ${id} is missing.`);
    }
    return entry;
  }

  private updateEditorLayer({
    id,
    update,
  }: {
    id: string;
    update: Partial<Omit<EditorLayer, "id">>;
  }): void {
    const { project } = this.store.get();
    this.store.update({
      project: {
        ...project,
        layers: project.layers.map((entry) =>
          entry.id === id ? { ...entry, ...update } : entry,
        ),
      },
    });
  }

  serializeProject(): Project {
    return serializeEditorProject(this.store.get().project);
  }

  deserializeProject({ file, project }: ProjectFile): void {
    const editorProject = deserializeEditorProject(project);
    this.store.update({ file, project: editorProject, selection: undefined });
    for (const { id, layer } of editorProject.layers) {
      if (layer.type === "video" || layer.type === "audio") {
        this.loadLayerAudio({ id, src: layer.src });
      }
    }
    this.syncPlayback();
    this.seek(getOutputRange(project).start);
  }

  /**
   * Notifies on changes to what the project file holds, so loading a layer's
   * audio does not count as an unsaved change.
   */
  subscribePersistableState(listener: () => void): () => void {
    return this.store.subscribeWithSelector({
      selector: ({ project }) => [
        project.canvas,
        project.output,
        project.locators,
        ...project.layers.map(({ layer }) => layer),
      ],
      equals: shallowEqual,
      listener,
    });
  }
}
