import { type AudioView, queryAudioView } from "../lib/audio-view";
import { cn } from "./ui/utils";

/** Peaks of a source interval, drawn like toy-midi's `AudioWaveformView`. */
export function AudioWaveformView({
  audioView,
  sourceStart,
  sourceEnd,
  pixelsPerSecond,
  dimmed,
  testId = "timeline-waveform",
}: {
  audioView: AudioView;
  /** Source time at the left edge of the parent, in seconds. */
  sourceStart: number;
  sourceEnd: number;
  /** Timeline scale, and the query's target points per second, aiming for one peak per pixel. */
  pixelsPerSecond: number;
  /** Drawn faintly when the layer's audio does not reach the mix. */
  dimmed: boolean;
  testId?: string;
}) {
  // Expand culling to source-anchored 256 px windows. Small scrolls keep the
  // same query and SVG bounds, and the parent clips the excess waveform.
  const cullStep = 256;
  const slice = queryAudioView(audioView, {
    start:
      (Math.floor((sourceStart * pixelsPerSecond) / cullStep) * cullStep) /
      pixelsPerSecond,
    end:
      (Math.ceil((sourceEnd * pixelsPerSecond) / cullStep) * cullStep) /
      pixelsPerSecond,
    pointsPerSecond: pixelsPerSecond,
  });
  if (slice.data.length === 0) {
    return null;
  }

  const upperPoints: string[] = [];
  const lowerPoints: string[] = [];
  for (let i = 0; i < slice.data.length; i++) {
    upperPoints.push(`${i},${-slice.data[i]}`);
    lowerPoints.unshift(`${i},${slice.data[i]}`);
  }
  const pathData = `M ${upperPoints.join(" L ")} L ${lowerPoints.join(" L ")} Z`;

  return (
    <svg
      data-testid={testId}
      data-dimmed={dimmed || undefined}
      className={cn("pointer-events-none absolute", dimmed && "opacity-40")}
      style={{
        left: (slice.actualStart - sourceStart) * pixelsPerSecond,
        width: (slice.actualEnd - slice.actualStart) * pixelsPerSecond,
        top: "5%",
        height: "90%",
      }}
      viewBox={`0 -1 ${slice.data.length} 2`}
      preserveAspectRatio="none"
    >
      <path
        d={pathData}
        fill="rgba(255, 255, 255, 0.3)"
        stroke="rgba(255, 255, 255, 0.5)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
