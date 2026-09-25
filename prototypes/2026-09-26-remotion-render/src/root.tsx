// One generic composition whose input props are a project file.
// Canvas size, frame rate, and duration come from the project,
// and source sizes are probed up front so layers can be fitted synchronously.

import { getVideoMetadata } from "@remotion/media-utils";
import { Composition, type CalculateMetadataFunction, staticFile } from "remotion";
import type { Project } from "../../2026-09-26-ffmpeg-compiler/project.ts";
import { outputRange, ProjectComposition, type ProjectProps, type Size } from "./project-composition.tsx";

export function Root() {
  return (
    <Composition
      id="Project"
      component={ProjectComposition}
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

const calculateMetadata: CalculateMetadataFunction<ProjectProps> = async ({ props }) => {
  const { canvas } = props;
  const range = outputRange(props);
  return {
    width: canvas.width,
    height: canvas.height,
    fps: canvas.fps,
    durationInFrames: Math.max(1, Math.round((range.end - range.start) * canvas.fps)),
    props: { ...props, sizes: await probeSizes(props) },
  };
};

async function probeSizes(project: Project): Promise<Record<string, Size>> {
  const sizes: Record<string, Size> = {};
  for (const layer of project.layers) {
    if (layer.type === "video" && !sizes[layer.src]) {
      const { width, height } = await getVideoMetadata(staticFile(layer.src));
      sizes[layer.src] = { width, height };
    }
    if (layer.type === "image" && !sizes[layer.src]) {
      sizes[layer.src] = await imageSize(staticFile(layer.src));
    }
  }
  return sizes;
}

function imageSize(src: string) {
  return new Promise<Size>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });
}
