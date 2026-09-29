import { loadMediaDuration } from "../utils/media.ts";
import { watchPromise, type PromiseState } from "../utils/promise-state.ts";
import { createStore } from "../utils/store.ts";
import { apiClient, type ProjectFile } from "./api-client.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { createAudioView, type AudioView } from "./audio-view.ts";
import { getContentRange, getOutputRange } from "./layout.ts";
import type { AudioLayer, Layer, Project, VideoLayer } from "./project.ts";
import { snapToFrame } from "./timeline.ts";
import { AudioContextTransport } from "./transport.ts";
import { VideoPlayback } from "./video-playback.ts";

export type EditorSelection =
  | { type: "output" }
  | { type: "layer"; id: string };

/**
 * A project layer with the editor's identity for it, like toy-midi's runtime
 * clips. The id is assigned on load and dropped on save, so it survives edits,
 * additions, and removals without ever reaching the file.
 */
export type EditorLayer = Layer & { id: string };

export type EditorProject = Omit<Project, "layers"> & { layers: EditorLayer[] };

export interface DecodedAudio {
  buffer: AudioBuffer;
  view: AudioView;
}

export interface EditorState {
  /** Project file path relative to the projects root, which is also where saves go. */
  file: string;
  project: EditorProject;
  /** Follows the transport, on the frame grid whenever playback is stopped. */
  playhead: number;
  playing: boolean;
  selection?: EditorSelection;
  sourceDurations: Record<string, PromiseState<number>>;
  audioSources: Record<string, PromiseState<DecodedAudio>>;
}

export function getSelectedLayer({
  project,
  selection,
}: Pick<EditorState, "project" | "selection">): EditorLayer | undefined {
  return selection?.type === "layer"
    ? project.layers.find((layer) => layer.id === selection.id)
    : undefined;
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
    sourceDurations: {},
    audioSources: {},
  }));

  readonly context = new AudioContext();
  readonly transport = new AudioContextTransport(this.context);
  private readonly audioPlaybacks = new Map<string, AudioBufferPlayback>();
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
    this.transport.seek(Math.max(0, snapToFrame(time, project.canvas.fps)));
  }

  /** Steps the playhead by whole frames. */
  seekFrames(frames: number): void {
    const { project, playhead } = this.store.get();
    this.seek(playhead + frames / project.canvas.fps);
  }

  updateLayer({ id, update }: { id: string; update: Partial<Layer> }): void {
    this.reschedulePlayback(() => {
      const { project } = this.store.get();
      this.store.update({
        project: {
          ...project,
          layers: project.layers.map((layer) =>
            layer.id === id ? ({ ...layer, ...update } as EditorLayer) : layer,
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

  /**
   * Switches between video and still output. A still takes the playhead's
   * frame, and a video spans every layer so its markers trim inward.
   */
  setOutputType(type: Project["output"]["type"]): void {
    const { project, playhead } = this.store.get();
    if (project.output.type === type) {
      return;
    }
    this.setOutput(
      type === "still"
        ? { type, time: snapToFrame(playhead, project.canvas.fps) }
        : { type, ...getContentRange(project) },
    );
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
    const { project, audioSources } = this.store.get();
    const layers = new Map(project.layers.map((layer) => [layer.id, layer]));
    for (const [id, playback] of this.videoPlaybacks) {
      const layer = layers.get(id);
      if (layer?.type === "video") {
        playback.setLayer({ layer });
      }
    }

    const audioLayers = new Map<string, VideoLayer | AudioLayer>(
      project.layers.flatMap((layer) =>
        layer.type === "video" || layer.type === "audio"
          ? [[layer.id, layer] as const]
          : [],
      ),
    );
    for (const [id, playback] of this.audioPlaybacks) {
      if (!audioLayers.has(id)) {
        playback.dispose();
        this.audioPlaybacks.delete(id);
      }
    }
    for (const [id, layer] of audioLayers) {
      let playback = this.audioPlaybacks.get(id);
      if (!playback) {
        playback = new AudioBufferPlayback({ transport: this.transport });
        this.audioPlaybacks.set(id, playback);
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
    const decodeAudio = async (): Promise<DecodedAudio> => {
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
    const { project } = this.store.get();
    return {
      ...project,
      layers: project.layers.map(({ id: _id, ...layer }) => layer as Layer),
    };
  }

  deserializeProject({ file, project }: ProjectFile): void {
    this.store.update({
      file,
      project: {
        ...project,
        layers: project.layers.map((layer) => ({
          ...layer,
          id: crypto.randomUUID(),
        })),
      },
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
