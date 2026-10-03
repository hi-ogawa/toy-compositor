import path from "node:path";
import {
  placeMedia,
  intersect,
  getLayerRange,
  getOutputRange,
  getPictureRange,
  type TimeRange,
} from "../layout.ts";
import type {
  Canvas,
  AudioLayer,
  ColorLayer,
  Crop,
  ImageLayer,
  Layer,
  Project,
  MediaInfo,
  VideoInfo,
  TextLayer,
  VideoLayer,
} from "../project.ts";
import type { Resolved } from "./resolve.ts";

/**
 * Compile a project, with the media info it carries and its resolved text
 * images, into the ffmpeg inputs, filter graph, and output options, without
 * any I/O. The caller adds the output file.
 * Each layer compiles on its own into the streams it contributes, and then one
 * graph overlays the visual streams on a solid canvas in layer order and mixes
 * the audio streams.
 */
export function compile({
  project,
  projectDir,
  resolved,
}: {
  project: Project;
  projectDir: string;
  resolved: Resolved;
}): string[] {
  const { canvas } = project;
  const range = getOutputRange(project);
  const duration = range.end - range.start;
  const scene: Scene = {
    canvas,
    range,
    withAudio: project.output.type === "video",
  };
  const layers = project.layers.map((layer, i) =>
    compileLayer({
      layer,
      index: i,
      projectDir,
      mediaInfoMap: project.media,
      resolved,
      scene,
    }),
  );
  const graph = assembleGraph({ canvas, duration, layers });

  const outputArgs = ["-map", "[vout]"];
  if (project.output.type === "still") {
    outputArgs.push("-frames:v", "1", "-update", "1");
  } else {
    outputArgs.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-r",
      String(canvas.fps),
      "-t",
      String(duration),
    );
    if (graph.hasAudio) {
      outputArgs.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
    }
    outputArgs.push("-movflags", "+faststart");
  }

  return [
    ...graph.inputs,
    "-filter_complex",
    graph.filters.join(";\n"),
    ...outputArgs,
  ];
}

/** The output settings every layer compiles against. */
type Scene = {
  canvas: Canvas;
  /** The output's timeline range. */
  range: TimeRange;
  /** Whether the output has an audio track, which a still does not. */
  withAudio: boolean;
};

/** The streams one layer contributes, before inputs are numbered and streams are labeled. */
type LayerStreams = {
  video?: VideoStream;
  audio?: AudioStream;
};

type VideoStream = {
  /** Input args, or undefined when the first filter generates the frames itself. */
  input?: string[];
  /** Filters from the input's video to the frames to overlay, already timed to the output. */
  filters: string[];
  x: number;
  y: number;
};

type AudioStream = {
  input: string[];
  /** Filters from the input's audio to samples already timed to the output. */
  filters: string[];
};

/** Look up the files and media info a layer needs, and compile it by type. */
function compileLayer({
  layer,
  index,
  projectDir,
  mediaInfoMap,
  resolved,
  scene,
}: {
  layer: Layer;
  index: number;
  projectDir: string;
  mediaInfoMap: Project["media"];
  resolved: Resolved;
  scene: Scene;
}): LayerStreams {
  switch (layer.type) {
    case "video": {
      return compileVideo({
        layer,
        file: path.resolve(projectDir, layer.src),
        mediaInfo: mediaInfoMap[layer.src],
        scene,
      });
    }
    case "image": {
      return compileImage({
        layer,
        file: path.resolve(projectDir, layer.src),
        mediaInfo: mediaInfoMap[layer.src],
        scene,
      });
    }
    case "text": {
      return compileText({ layer, file: resolved.texts.get(index)!, scene });
    }
    case "color": {
      return compileColor({ layer, scene });
    }
    case "audio": {
      return compileAudio({
        layer,
        file: path.resolve(projectDir, layer.src),
        scene,
      });
    }
  }
}

function compileVideo({
  layer,
  file,
  mediaInfo,
  scene,
}: {
  layer: VideoLayer;
  file: string;
  mediaInfo: MediaInfo;
  scene: Scene;
}): LayerStreams {
  const visible = intersect(getPictureRange(layer), scene.range);
  if (!visible) {
    return {};
  }
  const video = mediaInfo.video!;
  const placed = placeMedia({
    source: video,
    crop: layer.crop,
    transform: layer.transform,
  });
  const read = getSourceRead({ layer, visible, scene });
  // The held spans are silent, so sound covers only the layer range.
  const audible = intersect(getLayerRange(layer), scene.range);
  return {
    video: {
      input: buildSeekInput({
        file,
        seek: getFrameShownAt(video, { time: read.time }),
        duration: read.duration,
      }),
      filters: [
        `fps=${scene.canvas.fps}`,
        ...(read.before > 0 || read.after > 0
          ? [
              `tpad=start_duration=${read.before}:stop_duration=${read.after}:start_mode=clone:stop_mode=clone`,
            ]
          : []),
        `setpts=PTS-STARTPTS+${visible.start - scene.range.start}/TB`,
        ...buildCropFilters(layer.crop),
        `scale=${placed.width}:${placed.height}`,
      ],
      x: placed.x,
      y: placed.y,
    },
    audio:
      audible && scene.withAudio && !layer.muted && mediaInfo.audio
        ? compileAudioStream({ layer, file, visible: audible, scene })
        : undefined,
  };
}

/**
 * Source span a video layer reads for its visible part, the part of its
 * picture inside the scene range, and the seconds of its first and last frames
 * to clone around it.
 */
function getSourceRead({
  layer,
  visible,
  scene,
}: {
  layer: VideoLayer;
  visible: TimeRange;
  scene: Scene;
}) {
  const range = getLayerRange(layer);
  const played = intersect(range, visible);
  // A visible part that overlaps the played part reads it and clones its edge
  // frames over the rest, such as rendering 0.5 s to 1.5 s of a layer playing
  // 1 s to 2 s with 1 s holds:
  //
  //   0        1        2        3
  //   |  hold  |  play  |  hold  |
  //       [--------]                  visible
  //       [---][---]                  clone, read
  if (played) {
    return {
      time: layer.in + played.start - layer.start,
      duration: played.end - played.start,
      before: played.start - visible.start,
      after: visible.end - played.end,
    };
  }
  // A visible part entirely in a hold, such as a still or rendering 0.25 s to
  // 0.75 s of the same layer, reads the one frame it holds and clones it over
  // the visible part:
  //
  //   0        1        2        3
  //   |  hold  |  play  |  hold  |
  //     [----]                        visible, cloned
  //            ^                      read the first frame
  const frame = 1 / scene.canvas.fps;
  return {
    time: visible.end <= range.start ? layer.in : layer.out - frame,
    duration: frame,
    before: 0,
    after: visible.end - visible.start - frame,
  };
}

function compileImage({
  layer,
  file,
  mediaInfo,
  scene,
}: {
  layer: ImageLayer;
  file: string;
  mediaInfo: MediaInfo;
  scene: Scene;
}): LayerStreams {
  const visible = intersect(getLayerRange(layer), scene.range);
  if (!visible) {
    return {};
  }
  const placed = placeMedia({
    source: mediaInfo.video!,
    crop: layer.crop,
    transform: layer.transform,
  });
  return {
    video: {
      input: buildStillInput({
        file,
        fps: scene.canvas.fps,
        duration: visible.end - visible.start,
      }),
      filters: [
        ...buildCropFilters(layer.crop),
        `scale=${placed.width}:${placed.height}`,
        `setpts=PTS-STARTPTS+${visible.start - scene.range.start}/TB`,
      ],
      x: placed.x,
      y: placed.y,
    },
  };
}

function compileText({
  layer,
  file,
  scene,
}: {
  layer: TextLayer;
  file: string;
  scene: Scene;
}): LayerStreams {
  const visible = intersect(getLayerRange(layer), scene.range);
  if (!visible) {
    return {};
  }
  return {
    video: {
      input: buildStillInput({
        file,
        fps: scene.canvas.fps,
        duration: visible.end - visible.start,
      }),
      filters: [`setpts=PTS-STARTPTS+${visible.start - scene.range.start}/TB`],
      // The stroked copy pads the PNG by half the outline width, so shift it back up.
      x: layer.box.x,
      y: layer.box.y - Math.round((layer.outline?.width ?? 0) / 2),
    },
  };
}

function compileColor({
  layer,
  scene,
}: {
  layer: ColorLayer;
  scene: Scene;
}): LayerStreams {
  const visible = intersect(getLayerRange(layer), scene.range);
  if (!visible) {
    return {};
  }
  const { canvas } = scene;
  const { box } = layer;
  return {
    video: {
      filters: [
        `color=c=${layer.color}@${layer.opacity ?? 1}:s=${box.width}x${box.height}:r=${canvas.fps}:d=${visible.end - visible.start}`,
        "format=rgba",
        `setpts=PTS-STARTPTS+${visible.start - scene.range.start}/TB`,
      ],
      x: box.x,
      y: box.y,
    },
  };
}

function compileAudio({
  layer,
  file,
  scene,
}: {
  layer: AudioLayer;
  file: string;
  scene: Scene;
}): LayerStreams {
  const visible = intersect(getLayerRange(layer), scene.range);
  if (!visible || !scene.withAudio || layer.muted) {
    return {};
  }
  return { audio: compileAudioStream({ layer, file, visible, scene }) };
}

/**
 * Fade the audio of a video or audio layer at the layer's own edges, then trim
 * it to its visible range and delay it into place, so the output range only
 * cuts a layer and never reshapes it.
 */
function compileAudioStream({
  layer,
  file,
  visible,
  scene,
}: {
  layer: VideoLayer | AudioLayer;
  file: string;
  visible: TimeRange;
  scene: Scene;
}): AudioStream {
  // Decode from the layer's start, because afade cannot start before the
  // stream does, and a fade-in can begin before the visible range.
  const trimStart = visible.start - layer.start;
  const layerDuration = layer.out - layer.in;
  const delayMs = Math.round((visible.start - scene.range.start) * 1000);
  return {
    input: buildSeekInput({
      file,
      seek: layer.in,
      duration: visible.end - layer.start,
    }),
    filters: [
      "aformat=sample_rates=48000:channel_layouts=stereo",
      ...(layer.fadeIn ? [`afade=t=in:st=0:d=${layer.fadeIn}`] : []),
      ...(layer.fadeOut
        ? [`afade=t=out:st=${layerDuration - layer.fadeOut}:d=${layer.fadeOut}`]
        : []),
      ...(trimStart > 0
        ? [`atrim=start=${trimStart}`, "asetpts=PTS-STARTPTS"]
        : []),
      `adelay=delays=${delayMs}:all=1`,
    ],
  };
}

/**
 * Wire the layers' streams into one filter graph. Inputs are numbered in layer
 * order, each visual stream is overlaid on the previous result starting from a
 * solid canvas, and the audio streams are mixed and padded to the output duration.
 */
function assembleGraph({
  canvas,
  duration,
  layers,
}: {
  canvas: Canvas;
  duration: number;
  layers: LayerStreams[];
}) {
  const inputs: string[][] = [];
  const filters = [
    `color=c=${canvas.background ?? "#000000"}:s=${canvas.width}x${canvas.height}:r=${canvas.fps}:d=${duration}[canvas]`,
  ];
  const audioLabels: string[] = [];
  let base = "canvas";
  layers.forEach(({ video, audio }, i) => {
    if (video) {
      const source = video.input ? `[${inputs.push(video.input) - 1}:v]` : "";
      filters.push(`${source}${video.filters.join(",")}[v${i}]`);
      filters.push(
        `[${base}][v${i}]overlay=x=${video.x}:y=${video.y}:eof_action=pass[over${i}]`,
      );
      base = `over${i}`;
    }
    if (audio) {
      const k = inputs.push(audio.input) - 1;
      filters.push(`[${k}:a]${audio.filters.join(",")}[a${i}]`);
      audioLabels.push(`a${i}`);
    }
  });
  filters.push(`[${base}]format=yuv420p[vout]`);
  if (audioLabels.length > 0) {
    filters.push(
      `${audioLabels.map((l) => `[${l}]`).join("")}amix=inputs=${audioLabels.length}:normalize=0:duration=longest,apad,atrim=0:${duration}[aout]`,
    );
  }
  return {
    inputs: inputs.flat(),
    filters,
    hasAudio: audioLabels.length > 0,
  };
}

/**
 * The frame shown at a source time is the frame whose timestamp is nearest to it.
 * Project times are rounded to milliseconds and a source's first frame can start
 * off the project's frame grid, so a time often lands a hair before or after a
 * frame, and picking the nearest frame keeps renderers from disagreeing by one.
 * ffmpeg's accurate seek starts from the first frame at or after the seek time,
 * so seek to just before that frame. Assumes a constant frame rate source.
 */
function getFrameShownAt(video: VideoInfo, { time }: { time: number }) {
  const { startTime, frameRate } = video;
  const index = Math.round((time - startTime) * frameRate);
  return Math.max(0, startTime + index / frameRate - 0.1 / frameRate);
}

function buildSeekInput({
  file,
  seek,
  duration,
}: {
  file: string;
  seek: number;
  duration: number;
}) {
  return ["-ss", seek.toFixed(6), "-t", duration.toFixed(6), "-i", file];
}

function buildStillInput({
  file,
  fps,
  duration,
}: {
  file: string;
  fps: number;
  duration: number;
}) {
  return [
    "-loop",
    "1",
    "-framerate",
    String(fps),
    "-t",
    duration.toFixed(3),
    "-i",
    file,
  ];
}

function buildCropFilters(crop?: Crop) {
  if (!crop) {
    return [];
  }
  const { left = 0, right = 0, top = 0, bottom = 0 } = crop;
  return [
    `crop=iw*${1 - left - right}:ih*${1 - top - bottom}:iw*${left}:ih*${top}`,
  ];
}
