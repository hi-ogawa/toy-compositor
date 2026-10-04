import path from "node:path";
import {
  getVisibleBox,
  intersect,
  getClipRange,
  getOutputRange,
  getPictureRange,
  type TimeRange,
} from "../layout.ts";
import type {
  Canvas,
  AudioClip,
  Clip,
  ColorClip,
  Crop,
  ImageClip,
  Project,
  MediaInfo,
  VideoInfo,
  TextClip,
  VideoClip,
} from "../project.ts";
import type { Resolved } from "./resolve.ts";

/**
 * Compile without any I/O, so the caller adds the output file.
 * Clips in a layer never overlap, so their streams overlay at the layer's
 * position in any order.
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
  const clips = project.layers.flatMap((layer) =>
    layer.clips.map((clip) => {
      const streams = compileClip({
        clip,
        projectDir,
        mediaInfoMap: project.media,
        resolved,
        scene,
      });
      return {
        video: layer.hidden ? undefined : streams.video,
        audio: layer.muted ? undefined : streams.audio,
      };
    }),
  );
  const graph = assembleGraph({ canvas, duration, clips });

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

/** The output settings every clip compiles against. */
type Scene = {
  canvas: Canvas;
  /** The output's timeline range. */
  range: TimeRange;
  /** Whether the output has an audio track, which a still does not. */
  withAudio: boolean;
};

/** The streams one clip contributes, before inputs are numbered and streams are labeled. */
type ClipStreams = {
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

function compileClip({
  clip,
  projectDir,
  mediaInfoMap,
  resolved,
  scene,
}: {
  clip: Clip;
  projectDir: string;
  mediaInfoMap: Project["media"];
  resolved: Resolved;
  scene: Scene;
}): ClipStreams {
  switch (clip.type) {
    case "video": {
      return compileVideo({
        clip,
        file: path.resolve(projectDir, clip.src),
        mediaInfo: mediaInfoMap[clip.src],
        scene,
      });
    }
    case "image": {
      return compileImage({
        clip,
        file: path.resolve(projectDir, clip.src),
        mediaInfo: mediaInfoMap[clip.src],
        scene,
      });
    }
    case "text": {
      return compileText({ clip, file: resolved.texts.get(clip)!, scene });
    }
    case "color": {
      return compileColor({ clip, scene });
    }
    case "audio": {
      return compileAudio({
        clip,
        file: path.resolve(projectDir, clip.src),
        scene,
      });
    }
  }
}

function compileVideo({
  clip,
  file,
  mediaInfo,
  scene,
}: {
  clip: VideoClip;
  file: string;
  mediaInfo: MediaInfo;
  scene: Scene;
}): ClipStreams {
  const visible = intersect(getPictureRange(clip), scene.range);
  if (!visible) {
    return {};
  }
  const video = mediaInfo.video!;
  const box = getVisibleBox({
    size: video,
    crop: clip.crop,
    transform: clip.transform,
  });
  const read = getSourceRead({ clip, visible, scene });
  // The held spans are silent, so sound covers only the clip range.
  const audible = intersect(getClipRange(clip), scene.range);
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
        ...buildCropFilters(clip.crop),
        `scale=${box.width}:${box.height}`,
      ],
      x: box.x,
      y: box.y,
    },
    audio:
      audible && scene.withAudio && mediaInfo.audio
        ? compileAudioStream({ clip, file, visible: audible, scene })
        : undefined,
  };
}

/**
 * Source span a video clip reads for its visible part, the part of its
 * picture inside the scene range, and the seconds of its first and last frames
 * to clone around it.
 */
function getSourceRead({
  clip,
  visible,
  scene,
}: {
  clip: VideoClip;
  visible: TimeRange;
  scene: Scene;
}) {
  const range = getClipRange(clip);
  const played = intersect(range, visible);
  // A visible part that overlaps the played part reads it and clones its edge
  // frames over the rest, such as rendering 0.5 s to 1.5 s of a clip playing
  // 1 s to 2 s with 1 s holds:
  //
  //   0        1        2        3
  //   |  hold  |  play  |  hold  |
  //       [--------]                  visible
  //       [---][---]                  clone, read
  if (played) {
    return {
      time: clip.in + played.start - clip.start,
      duration: played.end - played.start,
      before: played.start - visible.start,
      after: visible.end - played.end,
    };
  }
  // A visible part entirely in a hold, such as a still or rendering 0.25 s to
  // 0.75 s of the same clip, reads the one frame it holds and clones it over
  // the visible part:
  //
  //   0        1        2        3
  //   |  hold  |  play  |  hold  |
  //     [----]                        visible, cloned
  //            ^                      read the first frame
  const frame = 1 / scene.canvas.fps;
  return {
    time: visible.end <= range.start ? clip.in : clip.out - frame,
    duration: frame,
    before: 0,
    after: visible.end - visible.start - frame,
  };
}

function compileImage({
  clip,
  file,
  mediaInfo,
  scene,
}: {
  clip: ImageClip;
  file: string;
  mediaInfo: MediaInfo;
  scene: Scene;
}): ClipStreams {
  const visible = intersect(getClipRange(clip), scene.range);
  if (!visible) {
    return {};
  }
  const box = getVisibleBox({
    size: mediaInfo.video!,
    crop: clip.crop,
    transform: clip.transform,
  });
  return {
    video: {
      input: buildStillInput({
        file,
        fps: scene.canvas.fps,
        duration: visible.end - visible.start,
      }),
      filters: [
        ...buildCropFilters(clip.crop),
        `scale=${box.width}:${box.height}`,
        `setpts=PTS-STARTPTS+${visible.start - scene.range.start}/TB`,
      ],
      x: box.x,
      y: box.y,
    },
  };
}

function compileText({
  clip,
  file,
  scene,
}: {
  clip: TextClip;
  file: string;
  scene: Scene;
}): ClipStreams {
  const visible = intersect(getClipRange(clip), scene.range);
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
      x: clip.box.x,
      y: clip.box.y - Math.round((clip.outline?.width ?? 0) / 2),
    },
  };
}

function compileColor({
  clip,
  scene,
}: {
  clip: ColorClip;
  scene: Scene;
}): ClipStreams {
  const visible = intersect(getClipRange(clip), scene.range);
  if (!visible) {
    return {};
  }
  const { canvas } = scene;
  const { box } = clip;
  return {
    video: {
      filters: [
        `color=c=${clip.color}@${clip.opacity}:s=${box.width}x${box.height}:r=${canvas.fps}:d=${visible.end - visible.start}`,
        "format=rgba",
        `setpts=PTS-STARTPTS+${visible.start - scene.range.start}/TB`,
      ],
      x: box.x,
      y: box.y,
    },
  };
}

function compileAudio({
  clip,
  file,
  scene,
}: {
  clip: AudioClip;
  file: string;
  scene: Scene;
}): ClipStreams {
  const visible = intersect(getClipRange(clip), scene.range);
  if (!visible || !scene.withAudio) {
    return {};
  }
  return { audio: compileAudioStream({ clip, file, visible, scene }) };
}

/**
 * Fade at the clip's own edges before trimming to the visible range, so the
 * output range only cuts a clip and never reshapes it.
 */
function compileAudioStream({
  clip,
  file,
  visible,
  scene,
}: {
  clip: VideoClip | AudioClip;
  file: string;
  visible: TimeRange;
  scene: Scene;
}): AudioStream {
  // Decode from the clip's start, because afade cannot start before the
  // stream does, and a fade-in can begin before the visible range.
  const trimStart = visible.start - clip.start;
  const clipDuration = clip.out - clip.in;
  const delayMs = Math.round((visible.start - scene.range.start) * 1000);
  return {
    input: buildSeekInput({
      file,
      seek: clip.in,
      duration: visible.end - clip.start,
    }),
    filters: [
      "aformat=sample_rates=48000:channel_layouts=stereo",
      ...(clip.fadeIn ? [`afade=t=in:st=0:d=${clip.fadeIn}`] : []),
      ...(clip.fadeOut
        ? [`afade=t=out:st=${clipDuration - clip.fadeOut}:d=${clip.fadeOut}`]
        : []),
      ...(trimStart > 0
        ? [`atrim=start=${trimStart}`, "asetpts=PTS-STARTPTS"]
        : []),
      `adelay=delays=${delayMs}:all=1`,
    ],
  };
}

function assembleGraph({
  canvas,
  duration,
  clips,
}: {
  canvas: Canvas;
  duration: number;
  clips: ClipStreams[];
}) {
  const inputs: string[][] = [];
  const filters = [
    `color=c=${canvas.background}:s=${canvas.width}x${canvas.height}:r=${canvas.fps}:d=${duration}[canvas]`,
  ];
  const audioLabels: string[] = [];
  let base = "canvas";
  clips.forEach(({ video, audio }, i) => {
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

function buildCropFilters(crop: Crop) {
  const { left, right, top, bottom } = crop;
  if (!left && !right && !top && !bottom) {
    return [];
  }
  return [
    `crop=iw*${1 - left - right}:ih*${1 - top - bottom}:iw*${left}:ih*${top}`,
  ];
}
