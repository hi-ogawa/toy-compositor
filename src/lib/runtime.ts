import { createNumberedName } from "../utils/name.ts";
import { watchPromise, type PromiseState } from "../utils/promise-state.ts";
import { createStore } from "../utils/store.ts";
import { apiClient } from "./api-client.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { createAudioView, type AudioView } from "./audio-view.ts";
import {
  createColorLayer,
  createLayerName,
  createMediaLayer,
  createTextLayer,
} from "./layer-defaults.ts";
import { getContentRange, getOutputRange, type TimeRange } from "./layout.ts";
import type { MediaFile } from "./media-file.ts";
import type {
  Canvas,
  Clip,
  Layer,
  Locator,
  Output,
  Project,
} from "./project.ts";
import type { ProjectFile } from "./server/api.ts";
import { roundToMillisecond, snapToFrame } from "./timeline.ts";
import { AudioContextTransport } from "./transport.ts";
import { VideoPlayback } from "./video-playback.ts";

/** A project layer with ids for it and its clips that are stable for the session but never saved. */
export type EditorLayer = Omit<Layer, "clips"> & {
  id: string;
  clips: EditorClip[];
};

/** A project clip with an id that is stable for the session but never saved. */
export type EditorClip = Clip & { id: string };

/** A project locator with an id that is stable for the session but never saved. */
export type EditorLocator = Locator & { id: string };

/** The project as the editor holds it, which saves without the layer, clip, and locator ids. */
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

  /** Updates what applies to the whole layer, which a mute does for every clip's sound. */
  updateLayer({
    id,
    update,
  }: {
    id: string;
    update: Partial<Omit<Layer, "clips">>;
  }): void {
    this.reschedulePlayback(() => {
      const { project } = this.store.get();
      this.store.update({
        project: {
          ...project,
          layers: project.layers.map((layer) =>
            layer.id === id ? { ...layer, ...update } : layer,
          ),
        },
      });
      this.syncPlayback();
    });
  }

  /** Updates a clip's timing, layout, or content. */
  updateClip({ id, update }: { id: string; update: Partial<Clip> }): void {
    this.reschedulePlayback(() => {
      const { project } = this.store.get();
      this.store.update({
        project: {
          ...project,
          layers: project.layers.map((layer) =>
            layer.clips.some((clip) => clip.id === id)
              ? {
                  ...layer,
                  clips: layer.clips.map((clip) =>
                    clip.id === id
                      ? ({ ...clip, ...update } as EditorClip)
                      : clip,
                  ),
                }
              : layer,
          ),
        },
      });
      this.syncPlayback();
    });
  }

  /**
   * Adds a layer holding one clip of the file, and returns the clip's id.
   * Probes and records the file's media info first if the project has none.
   */
  async addMediaLayer({ src, type }: MediaFile): Promise<string> {
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
    return this.insertLayer(
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

  addTextLayer(): string {
    const { canvas, layers } = this.store.get().project;
    return this.insertLayer(
      createTextLayer({
        name: createLayerName({ layers, type: "text" }),
        canvas,
        range: this.getNewStillRange(),
      }),
    );
  }

  addColorLayer(): string {
    const { canvas, layers } = this.store.get().project;
    return this.insertLayer(
      createColorLayer({
        name: createLayerName({ layers, type: "color" }),
        canvas,
        range: this.getNewStillRange(),
      }),
    );
  }

  removeLayer(id: string): void {
    this.reschedulePlayback(() => {
      const { project } = this.store.get();
      this.store.update({
        project: {
          ...project,
          layers: project.layers.filter((layer) => layer.id !== id),
        },
      });
      this.syncPlayback();
    });
  }

  /** Swaps a layer with its neighbor, where "up" is toward the top of the stack. */
  moveLayer({ id, direction }: { id: string; direction: "up" | "down" }): void {
    const { layers } = this.store.get().project;
    const index = layers.findIndex((layer) => layer.id === id);
    const target = direction === "up" ? index + 1 : index - 1;
    if (index === -1 || target < 0 || target >= layers.length) {
      return;
    }
    this.reschedulePlayback(() => {
      const { project } = this.store.get();
      const next = project.layers.slice();
      [next[index], next[target]] = [next[target]!, next[index]!];
      this.store.update({ project: { ...project, layers: next } });
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

  /**
   * Makes a composition `<video>` follow the transport as the video clip
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

  /** Adds a layer holding one clip on top of the stack, and returns the clip's id. */
  private insertLayer(layer: Layer): string {
    const editorLayer = deserializeEditorLayer(layer);
    this.reschedulePlayback(() => {
      const { project } = this.store.get();
      this.store.update({
        project: { ...project, layers: [...project.layers, editorLayer] },
      });
      this.syncPlayback();
    });
    for (const clip of layer.clips) {
      if (clip.type === "video" || clip.type === "audio") {
        this.loadAudio(clip.src);
      }
    }
    return editorLayer.clips[0]!.id;
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
    const clips = project.layers.flatMap((layer) =>
      layer.clips.map((clip) => ({ clip, muted: layer.muted ?? false })),
    );
    for (const [id, playback] of this.videoPlaybacks) {
      const clip = clips.find(({ clip }) => clip.id === id)?.clip;
      if (clip?.type === "video") {
        playback.setClip({ clip });
      }
    }

    const heard = new Set<string>();
    for (const { clip, muted } of clips) {
      if (clip.type !== "video" && clip.type !== "audio") {
        continue;
      }
      heard.add(clip.id);
      let playback = this.audioPlaybacks.get(clip.id);
      if (!playback) {
        playback = new AudioBufferPlayback({ transport: this.transport });
        this.audioPlaybacks.set(clip.id, playback);
      }
      playback.setClip({ clip, muted });
      const source = audioSources[clip.src];
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
    });
    this.syncPlayback();
    this.seek(getOutputRange(project).start);
    const sources = new Set(
      project.layers.flatMap((layer) =>
        layer.clips.flatMap((clip) =>
          clip.type === "video" || clip.type === "audio" ? [clip.src] : [],
        ),
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

/** A clip with the layer holding it, and where each sits in the stack and the layer. */
export type ClipLocation = {
  layer: EditorLayer;
  layerIndex: number;
  clip: EditorClip;
  clipIndex: number;
};

export function findClip(
  layers: readonly EditorLayer[],
  id: string,
): ClipLocation | undefined {
  for (const [layerIndex, layer] of layers.entries()) {
    const clipIndex = layer.clips.findIndex((clip) => clip.id === id);
    if (clipIndex !== -1) {
      return { layer, layerIndex, clip: layer.clips[clipIndex]!, clipIndex };
    }
  }
  return undefined;
}

function serializeEditorProject(project: EditorProject): Project {
  return {
    ...project,
    layers: project.layers.map(({ id: _id, ...layer }) => ({
      ...layer,
      clips: layer.clips.map(({ id: _id, ...clip }) => clip),
    })),
    locators: project.locators.map(({ id: _id, ...locator }) => locator),
  };
}

function deserializeEditorProject(project: Project): EditorProject {
  return {
    ...project,
    layers: project.layers.map(deserializeEditorLayer),
    locators: project.locators.map((locator): EditorLocator => ({
      ...locator,
      id: crypto.randomUUID(),
    })),
  };
}

function deserializeEditorLayer(layer: Layer): EditorLayer {
  return {
    ...layer,
    id: crypto.randomUUID(),
    clips: layer.clips.map((clip): EditorClip => ({
      ...clip,
      id: crypto.randomUUID(),
    })),
  };
}
