import { createStore } from "../utils/store.ts";
import { apiClient, type ProjectFile } from "./api-client.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { createAudioView, type AudioView } from "./audio-view.ts";
import { getOutputRange } from "./layout.ts";
import type { AudioLayer, Layer, Project, VideoLayer } from "./project.ts";
import { AudioContextTransport } from "./transport.ts";
import { VideoPlayback } from "./video-playback.ts";

export type EditorSelection =
  | { type: "output" }
  | { type: "layer"; index: number };

/** A source's audio track, loaded whether or not any layer is heard. */
export type AudioSource =
  | { status: "loading" }
  | { status: "loaded"; view: AudioView }
  | { status: "missing" };

export interface EditorState {
  /** Project file path relative to the projects root, which is also where saves go. */
  file: string;
  project: Project;
  /** Follows the transport, on the frame grid whenever playback is stopped. */
  playhead: number;
  playing: boolean;
  selection?: EditorSelection;
  /** Keyed by the source path of every video and audio layer. */
  audioSources: Record<string, AudioSource>;
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
    audioSources: {},
  }));

  readonly context = new AudioContext();
  readonly transport = new AudioContextTransport(this.context);
  /** Each source decodes once, shared by its layers' playback and waveforms. */
  private readonly audioBuffers = new Map<
    string,
    Promise<AudioBuffer | undefined>
  >();
  /** Keyed by layer index and source, so a replaced source restarts playback. */
  private readonly audioPlaybacks = new Map<string, AudioBufferPlayback>();
  private readonly videoPlaybacks = new Map<number, VideoPlayback>();

  constructor() {
    this.transport.store.subscribe(() => {
      const { position, isPlaying } = this.transport.store.get();
      this.store.update({ playhead: position, playing: isPlaying });
    });
    this.store.subscribeWithSelector({
      selector: (state) => state.project,
      listener: () => this.syncPlayback(),
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

    // Every video and audio layer gets a playback, and muting only decides
    // whether it schedules sound, so the muted camera still loads its audio
    // for the waveform and unmuting needs no load.
    const layers = new Map<string, VideoLayer | AudioLayer>(
      project.layers.flatMap((layer, index) =>
        layer.type === "video" || layer.type === "audio"
          ? [[`${index}:${layer.src}`, layer] as const]
          : [],
      ),
    );
    for (const [key, playback] of this.audioPlaybacks) {
      if (!layers.has(key)) {
        playback.dispose();
        this.audioPlaybacks.delete(key);
      }
    }
    for (const [key, layer] of layers) {
      let playback = this.audioPlaybacks.get(key);
      if (!playback) {
        playback = new AudioBufferPlayback({ transport: this.transport });
        this.audioPlaybacks.set(key, playback);
        void this.loadAudio(layer.src).then((buffer) => {
          if (buffer) {
            this.audioPlaybacks.get(key)?.setBuffer({ buffer });
          }
        });
      }
      playback.setLayer({ layer });
    }
  }

  /** Fetches and decodes a source's audio once, however many layers use it. */
  private loadAudio(src: string): Promise<AudioBuffer | undefined> {
    let buffer = this.audioBuffers.get(src);
    if (!buffer) {
      buffer = this.decodeAudio(src);
      this.audioBuffers.set(src, buffer);
    }
    return buffer;
  }

  private async decodeAudio(src: string): Promise<AudioBuffer | undefined> {
    this.setAudioSource({ src, source: { status: "loading" } });
    const url = apiClient.getMediaUrl({
      src,
      projectPath: this.store.get().file,
    });
    try {
      const response = await fetch(url);
      const buffer = await this.context.decodeAudioData(
        await response.arrayBuffer(),
      );
      this.setAudioSource({
        src,
        source: { status: "loaded", view: createAudioView(buffer) },
      });
      return buffer;
    } catch {
      // A video file without an audio stream contributes nothing, as in the render.
      this.setAudioSource({ src, source: { status: "missing" } });
      return undefined;
    }
  }

  private setAudioSource({
    src,
    source,
  }: {
    src: string;
    source: AudioSource;
  }): void {
    const { audioSources } = this.store.get();
    this.store.update({ audioSources: { ...audioSources, [src]: source } });
  }

  subscribePersistableState(listener: () => void): () => void {
    return this.store.subscribeWithSelector({
      selector: (state) => state.project,
      listener,
    });
  }
}
