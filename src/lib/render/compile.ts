import path from "node:path";
import { fitBox, intersect, outputRange, type Range } from "../layout.ts";
import type {
  AudioLayer,
  ColorLayer,
  Crop,
  ImageLayer,
  Layer,
  Project,
  TextLayer,
  VideoLayer,
} from "../project.ts";
import type { Media, Resolved } from "./resolve.ts";

/**
 * Compile a project and its resolved media into the ffmpeg inputs, filter graph,
 * and output options, without any I/O. The caller adds the output file.
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
  const range = outputRange(project);
  const duration = range.end - range.start;
  const scene: Scene = {
    canvas,
    range,
    withAudio: project.output.type === "video",
  };
  const layers = project.layers.map((layer, i) =>
    compileLayer({ layer, index: i, projectDir, resolved, scene }),
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
  canvas: Project["canvas"];
  /** The output's timeline range. */
  range: Range;
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

/** Look up the files and media facts a layer needs, and compile it by type. */
function compileLayer({
  layer,
  index,
  projectDir,
  resolved,
  scene,
}: {
  layer: Layer;
  index: number;
  projectDir: string;
  resolved: Resolved;
  scene: Scene;
}): LayerStreams {
  switch (layer.type) {
    case "video": {
      return compileVideo({
        layer,
        file: path.resolve(projectDir, layer.src),
        media: resolved.media.get(layer.src)!,
        scene,
      });
    }
    case "image": {
      return compileImage({
        layer,
        file: path.resolve(projectDir, layer.src),
        media: resolved.media.get(layer.src)!,
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
  media,
  scene,
}: {
  layer: VideoLayer;
  file: string;
  media: Media;
  scene: Scene;
}): LayerStreams {
  const visible = intersect(sourceSpan(layer), scene.range);
  if (!visible) {
    return {};
  }
  const fit = fitBox({ source: media, crop: layer.crop, box: layer.box });
  return {
    video: {
      input: seekInput({
        file,
        seek: frameShownAt({
          media,
          time: layer.in + visible.start - layer.start,
        }),
        duration: visible.end - visible.start,
      }),
      filters: [
        `fps=${scene.canvas.fps}`,
        `setpts=PTS-STARTPTS+${visible.start - scene.range.start}/TB`,
        ...cropFilters(layer.crop),
        `scale=${fit.width}:${fit.height}`,
      ],
      x: fit.x,
      y: fit.y,
    },
    audio:
      scene.withAudio && !layer.muted && media.hasAudio
        ? audioStream({ layer, file, visible, scene })
        : undefined,
  };
}

function compileImage({
  layer,
  file,
  media,
  scene,
}: {
  layer: ImageLayer;
  file: string;
  media: Media;
  scene: Scene;
}): LayerStreams {
  const visible = intersect(openSpan({ layer, scene }), scene.range);
  if (!visible) {
    return {};
  }
  const fit = fitBox({ source: media, crop: layer.crop, box: layer.box });
  return {
    video: {
      input: stillInput({
        file,
        fps: scene.canvas.fps,
        duration: visible.end - visible.start,
      }),
      filters: [
        ...cropFilters(layer.crop),
        `scale=${fit.width}:${fit.height}`,
        `setpts=PTS-STARTPTS+${visible.start - scene.range.start}/TB`,
      ],
      x: fit.x,
      y: fit.y,
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
  const visible = intersect(openSpan({ layer, scene }), scene.range);
  if (!visible) {
    return {};
  }
  return {
    video: {
      input: stillInput({
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
  const visible = intersect(openSpan({ layer, scene }), scene.range);
  if (!visible) {
    return {};
  }
  const { canvas } = scene;
  const box = layer.box ?? {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  };
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
  const visible = intersect(sourceSpan(layer), scene.range);
  if (!visible || !scene.withAudio || layer.muted) {
    return {};
  }
  return { audio: audioStream({ layer, file, visible, scene }) };
}

/** Trim, fade, and delay the audio of a video or audio layer to its visible range. */
function audioStream({
  layer,
  file,
  visible,
  scene,
}: {
  layer: VideoLayer | AudioLayer;
  file: string;
  visible: Range;
  scene: Scene;
}): AudioStream {
  const duration = visible.end - visible.start;
  const delayMs = Math.round((visible.start - scene.range.start) * 1000);
  return {
    input: seekInput({
      file,
      seek: layer.in + visible.start - layer.start,
      duration,
    }),
    filters: [
      "aformat=sample_rates=48000:channel_layouts=stereo",
      ...(layer.fadeIn ? [`afade=t=in:st=0:d=${layer.fadeIn}`] : []),
      ...(layer.fadeOut
        ? [`afade=t=out:st=${duration - layer.fadeOut}:d=${layer.fadeOut}`]
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
  canvas: Project["canvas"];
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

/** Timeline span of a layer placed by its source range. */
function sourceSpan(layer: VideoLayer | AudioLayer): Range {
  return { start: layer.start, end: layer.start + layer.out - layer.in };
}

/** Timeline span of a layer whose missing edges extend to the output range. */
function openSpan({
  layer,
  scene,
}: {
  layer: { start?: number; end?: number };
  scene: Scene;
}): Range {
  return {
    start: layer.start ?? scene.range.start,
    end: layer.end ?? scene.range.end,
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
function frameShownAt({ media, time }: { media: Media; time: number }) {
  const { startTime, frameRate } = media;
  const index = Math.round((time - startTime) * frameRate);
  return Math.max(0, startTime + index / frameRate - 0.1 / frameRate);
}

function seekInput({
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

function stillInput({
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

function cropFilters(crop?: Crop) {
  if (!crop) {
    return [];
  }
  const { left = 0, right = 0, top = 0, bottom = 0 } = crop;
  return [
    `crop=iw*${1 - left - right}:ih*${1 - top - bottom}:iw*${left}:ih*${top}`,
  ];
}
