import { createNumberedName } from "../utils/name.ts";
import { watchPromise, type PromiseState } from "../utils/promise-state.ts";
import { createStore } from "../utils/store.ts";
import { apiClient } from "./api-client.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { createAudioView, type AudioView } from "./audio-view.ts";
import {
  createColorLayer,
  createMediaLayer,
  createTextLayer,
} from "./layer-defaults.ts";
import { getContentRange, getOutputRange, type TimeRange } from "./layout.ts";
import type { MediaFile } from "./media-file.ts";
import {
  deserializeEditorProject,
  serializeEditorProject,
} from "./persistence.ts";
import type { Canvas, Layer, Locator, Output, Project } from "./project.ts";
import type { ProjectFile } from "./server/api.ts";
import { roundToMillisecond, snapToFrame } from "./timeline.ts";
import { AudioContextTransport } from "./transport.ts";
import { VideoPlayback } from "./video-playback.ts";

export type EditorSelection =
  | { type: "output" }
  | { type: "layer"; id: string };

/** A project layer with an id that is stable for the session but never saved. */
export type EditorLayer = Layer & { id: string };

/** A project locator with an id that is stable for the session but never saved. */
export type EditorLocator = Locator & { id: string };

/** The project as the editor holds it, which saves without the layer and locator ids. */
export type EditorProject = Omit<Project, "layers" | "locators"> & {
  layers: EditorLayer[];
  locators: EditorLocator[];
};

export interface DecodedAudio {
  buffer: AudioBuffer;
  view: AudioView;
}

export interface EditorState {
  /** Absolute project file path, which is also where saves go. */
  file: string;
  project: EditorProject;
  /** Follows the transport, on the frame grid whenever playback is stopped. */
  playhead: number;
  playing: boolean;
  selection?: EditorSelection;
  audioSources: Record<string, PromiseState<DecodedAudio>>;
}

const EMPTY_PROJECT: EditorProject = {
  canvas: { width: 1920, height: 1080, fps: 30 },
  output: { type: "video", start: 0, end: 0 },
  layers: [],
  locators: [],
  media: {},
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

  /** Probes and records the file's media info first if the project has none. */
  async addMediaLayer({ src, type }: MediaFile): Promise<void> {
    const { file } = this.store.get();
    let mediaInfo = this.store.get().project.media[src];
    if (!mediaInfo) {
      mediaInfo = await apiClient.loadMediaInfo({ src, projectPath: file });
      const { project } = this.store.get();
      this.store.update({
        project: { ...project, media: { ...project.media, [src]: mediaInfo } },
      });
    }
    const { project, playhead } = this.store.get();
    this.insertLayer(
      createMediaLayer({
        src,
        type,
        mediaInfo,
        canvas: project.canvas,
        start: snapToFrame(playhead, project.canvas.fps),
        stillRange: this.getNewStillRange(),
      }),
    );
  }

  addTextLayer(): void {
    const { canvas } = this.store.get().project;
    this.insertLayer(
      createTextLayer({ canvas, range: this.getNewStillRange() }),
    );
  }

  addColorLayer(): void {
    this.insertLayer(createColorLayer({ range: this.getNewStillRange() }));
  }

  removeLayer(id: string): void {
    this.reschedulePlayback(() => {
      const { project, selection } = this.store.get();
      this.store.update({
        project: {
          ...project,
          layers: project.layers.filter((layer) => layer.id !== id),
        },
        selection:
          selection?.type === "layer" && selection.id === id
            ? undefined
            : selection,
      });
      this.syncPlayback();
    });
  }

  setCanvas(canvas: Canvas): void {
    const { project } = this.store.get();
    this.store.update({ project: { ...project, canvas } });
  }

  setOutput(output: Output): void {
    const { project } = this.store.get();
    this.store.update({ project: { ...project, output } });
  }

  /**
   * Switches between video and still output. A still takes the playhead's
   * frame, and a video spans every layer so its markers trim inward.
   */
  setOutputType(type: Output["type"]): void {
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

  /** Appends a numbered locator, like toy-midi's `addLocator`, and returns its id. */
  addLocator(time: number): string {
    const { project } = this.store.get();
    const { locators } = project;
    const locator = {
      id: crypto.randomUUID(),
      label: createNumberedName({
        names: locators.map((locator) => locator.label),
        prefix: "Locator",
      }),
      time,
    };
    this.store.update({
      project: { ...project, locators: [...locators, locator] },
    });
    return locator.id;
  }

  updateLocator(id: string, update: Partial<Locator>): void {
    const { project } = this.store.get();
    this.store.update({
      project: {
        ...project,
        locators: project.locators.map((locator) =>
          locator.id === id ? { ...locator, ...update } : locator,
        ),
      },
    });
  }

  deleteLocator(id: string): void {
    const { project } = this.store.get();
    this.store.update({
      project: {
        ...project,
        locators: project.locators.filter((locator) => locator.id !== id),
      },
    });
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

  private insertLayer(layer: Layer): void {
    const id = crypto.randomUUID();
    this.reschedulePlayback(() => {
      const { project } = this.store.get();
      this.store.update({
        project: { ...project, layers: [...project.layers, { ...layer, id }] },
        selection: { type: "layer", id },
      });
      this.syncPlayback();
    });
    if (layer.type === "video" || layer.type === "audio") {
      this.loadAudio(layer.src);
    }
  }

  private getNewStillRange(): TimeRange {
    const output = getOutputRange(this.store.get().project);
    return { start: output.start, end: roundToMillisecond(output.end) };
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
    const { layers } = project;
    for (const [id, playback] of this.videoPlaybacks) {
      const layer = layers.find((layer) => layer.id === id);
      if (layer?.type === "video") {
        playback.setLayer({ layer });
      }
    }

    const heard = new Set<string>();
    for (const layer of layers) {
      if (layer.type !== "video" && layer.type !== "audio") {
        continue;
      }
      heard.add(layer.id);
      let playback = this.audioPlaybacks.get(layer.id);
      if (!playback) {
        playback = new AudioBufferPlayback({ transport: this.transport });
        this.audioPlaybacks.set(layer.id, playback);
      }
      playback.setLayer({ layer });
      const source = audioSources[layer.src];
      if (source?.status === "fulfilled") {
        playback.setBuffer({ buffer: source.value.buffer });
      }
    }
    for (const [id, playback] of this.audioPlaybacks) {
      if (!heard.has(id)) {
        playback.dispose();
        this.audioPlaybacks.delete(id);
      }
    }
  }

  /** Starts decoding a source, and syncs playback once its buffer arrives. */
  private loadAudio(src: string): void {
    if (this.store.get().audioSources[src]) {
      return;
    }
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

  serializeProject(): Project {
    return serializeEditorProject(this.store.get().project);
  }

  deserializeProject({ file, project }: ProjectFile): void {
    this.store.update({
      file,
      project: deserializeEditorProject(project),
      selection: undefined,
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
    }
  }

  subscribePersistableState(listener: () => void): () => void {
    return this.store.subscribeWithSelector({
      selector: (state) => state.project,
      listener,
    });
  }
}
