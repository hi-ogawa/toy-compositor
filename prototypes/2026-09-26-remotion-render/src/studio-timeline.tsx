// Studio-only tracks that show the project in context, like a Kdenlive timeline:
// the output range as its own track with the preview dimmed outside it, and each
// video or audio layer's whole source clip, so pre-roll such as sync hits is visible.

import type { ReactNode } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { Layer, Project } from "../../2026-09-26-ffmpeg-compiler/project.ts";
import { intersect, type Range, studioRow } from "./project-composition.tsx";

export function StudioTimeline({ project, timeline, output }: { project: Project; timeline: Range; output: Range }) {
  const fps = project.canvas.fps;
  const outside = [
    { name: "before output", range: { start: timeline.start, end: output.start } },
    { name: "after output", range: { start: output.end, end: timeline.end } },
  ];
  return (
    <>
      <Track name={`output ${seconds(output.start)}–${seconds(output.end)}`} range={output} timeline={timeline} fps={fps} />
      {outside.map(
        ({ name, range }) =>
          range.end > range.start && (
            <Track key={name} name={name} range={range} timeline={timeline} fps={fps}>
              <AbsoluteFill {...studioRow(`${name} dim`)} style={{ zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }}>
                <div style={{ margin: 24, color: "white", fontSize: 32, fontFamily: "sans-serif" }}>outside output</div>
              </AbsoluteFill>
            </Track>
          ),
      )}
    </>
  );
}

// The whole source clip of a video or audio layer, labeled with its in/out points.
export function SourceTrack({
  name,
  layer,
  duration,
  timeline,
  fps,
}: {
  name: string;
  layer: Layer;
  duration?: number;
  timeline: Range;
  fps: number;
}) {
  if ((layer.type !== "video" && layer.type !== "audio") || duration === undefined) return null;
  const source = { start: layer.start - layer.in, end: layer.start - layer.in + duration };
  const range = intersect(source, timeline);
  if (!range) return null;
  return (
    <Track
      name={`${name} source ${seconds(0)}–${seconds(duration)}, used ${seconds(layer.in)}–${seconds(layer.out)}`}
      range={range}
      timeline={timeline}
      fps={fps}
    />
  );
}

function Track({
  name,
  range,
  timeline,
  fps,
  children,
}: {
  name: string;
  range: Range;
  timeline: Range;
  fps: number;
  children?: ReactNode;
}) {
  const from = Math.round((range.start - timeline.start) * fps);
  const to = Math.round((range.end - timeline.start) * fps);
  return (
    <Sequence {...studioRow(name)} name={name} from={from} durationInFrames={Math.max(1, to - from)} layout="none">
      {children}
    </Sequence>
  );
}

function seconds(t: number) {
  return `${t.toFixed(1)}s`;
}
