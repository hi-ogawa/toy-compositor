import { createStore } from "../utils/store.ts";
import { apiClient, type ProjectFile } from "./api-client.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { getOutputRange } from "./layout.ts";
import type { AudioLayer, Layer, Project, VideoLayer } from "./project.ts";
import { AudioContextTransport } from "./transport.ts";
import { VideoPlayback } from "./video-playback.ts";

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
  /** Keyed by layer index and source, so a replaced source loads afresh. */
  private readonly audioPlaybacks = new Map<string, AudioBufferPlayback>();
  private readonly videoPlaybacks = new Map<number, VideoPlayback>();

  constructor() {
    this.transport.store.subscribe(() => {
      const { position, isPlaying } = this.transport.store.get();
      this.store.update({ playhead: position, playing: isPlaying });
    });
  }

  /**
   * Makes a composition `<video>` follow the transport as the video layer at
   * `index`, like toy-midi's `attachYouTubePlayer`. Returns its detacher.
   */
  attachVideo({
    index,
    element,
  }: {
    index: number;
    element: HTMLVideoElement;
  }): () => void {
    const playback = new VideoPlayback({ transport: this.transport, element });
    this.videoPlaybacks.set(index, playback);
    this.syncPlayback();
    return () => {
      playback.dispose();
      if (this.videoPlaybacks.get(index) === playback) {
        this.videoPlaybacks.delete(index);
      }
    };
  }

  select(selection: EditorSelection | undefined): void {
    this.store.update({ selection });
  }

  seek(time: number): void {
    const { project } = this.store.get();
    const frame = Math.max(0, Math.round(time * project.canvas.fps));
    this.transport.seek(Number((frame / project.canvas.fps).toFixed(3)));
  }

  async togglePlayback(): Promise<void> {
    if (this.store.get().playing) {
      this.transport.pause();
      // Land on a frame, so the paused preview matches a rendered frame.
      this.seek(this.store.get().playhead);
    } else {
      // Play is a user gesture, which lets the context start running.
      await this.context.resume();
      this.transport.play();
    }
  }

  /** Steps the playhead by whole frames. */
  seekFrames(frames: number): void {
    const { project, playhead } = this.store.get();
    this.seek(playhead + frames / project.canvas.fps);
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
    this.syncPlayback();
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
    this.syncPlayback();
    this.seek(getOutputRange(project).start);
  }

  /** Brings playback in line with the project after it loads or changes. */
  private syncPlayback(): void {
    const { project } = this.store.get();
    for (const [index, playback] of this.videoPlaybacks) {
      const layer = project.layers[index];
      if (layer?.type === "video") {
        playback.setLayer({ layer });
      }
    }

    // Audio layers, and video layers whose own audio is unmuted, are heard.
    const audible = new Map<string, VideoLayer | AudioLayer>(
      project.layers.flatMap((layer, index) =>
        layer.type === "audio" || (layer.type === "video" && !layer.muted)
          ? [[`${index}:${layer.src}`, layer] as const]
          : [],
      ),
    );
    for (const [key, playback] of this.audioPlaybacks) {
      if (!audible.has(key)) {
        playback.dispose();
        this.audioPlaybacks.delete(key);
      }
    }
    for (const [key, layer] of audible) {
      let playback = this.audioPlaybacks.get(key);
      if (!playback) {
        playback = new AudioBufferPlayback({ transport: this.transport });
        this.audioPlaybacks.set(key, playback);
        void this.loadAudio({ key, src: layer.src });
      }
      playback.setLayer({ layer });
    }
  }

  private async loadAudio({ key, src }: { key: string; src: string }) {
    const url = apiClient.getMediaUrl({
      src,
      projectPath: this.store.get().file,
    });
    try {
      const response = await fetch(url);
      const buffer = await this.context.decodeAudioData(
        await response.arrayBuffer(),
      );
      this.audioPlaybacks.get(key)?.setBuffer({ buffer });
    } catch {
      // A video file without an audio stream contributes nothing, as in the render.
    }
  }

  subscribePersistableState(listener: () => void): () => void {
    return this.store.subscribeWithSelector({
      selector: (state) => state.project,
      listener,
    });
  }
}
