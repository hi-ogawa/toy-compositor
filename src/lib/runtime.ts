import { loadMediaDuration } from "../utils/media.ts";
import { watchPromise, type PromiseState } from "../utils/promise-state.ts";
import { createStore } from "../utils/store.ts";
import { apiClient, type ProjectFile } from "./api-client.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { createAudioView, type AudioView } from "./audio-view.ts";
import { getOutputRange } from "./layout.ts";
import type { AudioLayer, Layer, Project, VideoLayer } from "./project.ts";
import { snapToFrame } from "./timeline.ts";
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
  sourceDurations: Record<string, PromiseState<number>>;
  audioSources: Record<
    string,
    PromiseState<{ buffer: AudioBuffer; view: AudioView }>
  >;
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
    sourceDurations: {},
    audioSources: {},
  }));

  readonly context = new AudioContext();
  readonly transport = new AudioContextTransport(this.context);
  private readonly audioPlaybacks = new Map<string, AudioBufferPlayback>();
  private readonly videoPlaybacks = new Map<number, VideoPlayback>();

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
    this.transport.seek(Math.max(0, snapToFrame(time, project.canvas.fps)));
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
    this.reschedulePlayback(() => {
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
    const { project, audioSources } = this.store.get();
    for (const [index, playback] of this.videoPlaybacks) {
      const layer = project.layers[index];
      if (layer?.type === "video") {
        playback.setLayer({ layer });
      }
    }

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
      }
      playback.setLayer({ layer });
      const source = audioSources[layer.src];
      if (source?.status === "fulfilled") {
        playback.setBuffer({ buffer: source.value.buffer });
      }
    }
  }

  /** Starts decoding a source, and syncs playback once its buffer arrives. */
  private loadAudio(src: string): void {
    const decodeAudio = async () => {
      const data = await apiClient.loadAudioData({
        src,
        projectPath: this.store.get().file,
      });
      const buffer = await this.context.decodeAudioData(data);
      return { buffer, view: createAudioView(buffer) };
    };
    watchPromise(decodeAudio(), (source) => {
      const { audioSources } = this.store.get();
      this.store.update({ audioSources: { ...audioSources, [src]: source } });
      if (source.status === "fulfilled") {
        this.reschedulePlayback(() => this.syncPlayback());
      }
    });
  }

  /**
   * Loads a source's duration as media elements report it, because playback
   * seeks media elements in the same source time that `in` and `out` are
   * measured in.
   */
  private loadDuration(src: string): void {
    const url = apiClient.getMediaUrl({
      src,
      projectPath: this.store.get().file,
    });
    watchPromise(loadMediaDuration(url), (duration) => {
      const { sourceDurations } = this.store.get();
      this.store.update({
        sourceDurations: { ...sourceDurations, [src]: duration },
      });
    });
  }

  serializeProject(): Project {
    return this.store.get().project;
  }

  deserializeProject({ file, project }: ProjectFile): void {
    this.store.update({
      file,
      project,
      selection: undefined,
      sourceDurations: {},
    });
    this.syncPlayback();
    this.seek(getOutputRange(project).start);
    const sources = new Set(
      project.layers.flatMap((layer) =>
        layer.type === "video" || layer.type === "audio" ? [layer.src] : [],
      ),
    );
    for (const src of sources) {
      this.loadAudio(src);
      this.loadDuration(src);
    }
  }

  subscribePersistableState(listener: () => void): () => void {
    return this.store.subscribeWithSelector({
      selector: (state) => state.project,
      listener,
    });
  }
}
