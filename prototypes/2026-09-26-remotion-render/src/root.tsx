// One generic composition whose input props are a project file.
// Canvas size, frame rate, and duration come from the project,
// and source sizes are probed up front so layers can be fitted synchronously.

import { getAudioDurationInSeconds, getVideoMetadata } from "@remotion/media-utils";
import { Composition, type CalculateMetadataFunction, getRemotionEnvironment, staticFile } from "remotion";
import type { Project } from "../../2026-09-26-ffmpeg-compiler/project.ts";
import { outputRange, ProjectComposition, type ProjectProps, type Range, type Size } from "./project-composition.tsx";
import { projectSchema } from "./schema.ts";

export function Root() {
  return (
    <Composition
      id="Project"
      component={ProjectComposition}
      schema={projectSchema}
      defaultProps={initialProject}
      calculateMetadata={calculateMetadata}
      width={initialProject.canvas.width}
      height={initialProject.canvas.height}
      fps={initialProject.canvas.fps}
      durationInFrames={1}
    />
  );
}

// studio.ts passes the project file as REMOTION_PROJECT, because props passed with
// --props take priority over the props panel and would ignore every edit there.
const initialProject: ProjectProps = process.env.REMOTION_PROJECT
  ? JSON.parse(process.env.REMOTION_PROJECT)
  : {
      canvas: { width: 1920, height: 1080, fps: 30 },
      output: { type: "still", time: 0 },
      layers: [],
    };

// In Studio the composition spans the whole timeline rather than only the output range.
const calculateMetadata: CalculateMetadataFunction<ProjectProps> = async ({ props }) => {
  const { sizes: _sizes, durations: _durations, timeline: _timeline, ...project } = props;
  const { canvas } = project;
  const { sizes, durations } = await probeSources(project);
  const timeline = getRemotionEnvironment().isStudio ? timelineRange(project, durations) : undefined;
  const range = timeline ?? outputRange(project);
  return {
    width: canvas.width,
    height: canvas.height,
    fps: canvas.fps,
    durationInFrames: Math.max(1, Math.round((range.end - range.start) * canvas.fps)),
    props: { ...project, sizes, durations, timeline },
  };
};

async function probeSources(project: Project) {
  const sizes: Record<string, Size> = {};
  const durations: Record<string, number> = {};
  for (const layer of project.layers) {
    if ((layer.type === "video" || layer.type === "audio") && durations[layer.src] === undefined) {
      if (/\.(wav|mp3|m4a|aac|flac|ogg)$/i.test(layer.src)) {
        durations[layer.src] = await getAudioDurationInSeconds(staticFile(layer.src));
      } else {
        const { width, height, durationInSeconds } = await getVideoMetadata(staticFile(layer.src));
        sizes[layer.src] = { width, height };
        durations[layer.src] = durationInSeconds;
      }
    }
    if (layer.type === "image" && !sizes[layer.src]) {
      sizes[layer.src] = await imageSize(staticFile(layer.src));
    }
  }
  return { sizes, durations };
}

// From 0 (or the earliest source) to the end of the output or the last source.
function timelineRange(project: Project, durations: Record<string, number>): Range {
  const output = outputRange(project);
  let start = Math.min(0, output.start);
  let end = output.end;
  for (const layer of project.layers) {
    if (layer.type === "video" || layer.type === "audio") {
      const sourceStart = layer.start - layer.in;
      start = Math.min(start, sourceStart);
      end = Math.max(end, sourceStart + (durations[layer.src] ?? layer.out));
    } else if (layer.end !== undefined) {
      end = Math.max(end, layer.end);
    }
  }
  return { start, end };
}

function imageSize(src: string) {
  return new Promise<Size>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });
}
