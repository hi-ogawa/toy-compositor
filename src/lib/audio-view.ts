// Waveform peaks, ported from toy-midi's `audio-view.ts`, with two
// source-aligned max-pooling levels:
//
// 1. createAudioView maps PCM frames into fixed peak buckets. With
//    samplesPerPoint = 4:
//
//      PCM frames:    0 1 2 3 | 4 5 6 7 | 8 9 10 11
//      view points:   point 0 | point 1 |  point 2
//
// 2. queryAudioView groups those points for the display scale. With
//    alignmentStep = 2:
//
//      view points:   0 1 | 2 3 | 4 5
//      output:         0  |  1  |  2
//
// Both levels are anchored at source frame/index 0, so a viewport selects
// globally aligned buckets instead of starting a new pooling grid at its
// visible edge. samplesPerPoint is the fixed base resolution, and
// alignmentStep grows with seconds per pixel as the timeline zooms out.

export interface AudioView {
  data: number[]; // amplitude values (0-1)
  samplesPerPoint: number; // each point represents this many samples (exact integer)
  sampleRate: number; // for time↔sample conversion
}

// Result of querying AudioView - includes geometry info for renderer positioning
export interface AudioViewSlice {
  data: number[]; // culled and downsampled peaks
  actualStart: number; // source time of data[0]
  actualEnd: number; // source time of data.at(-1)
}

/**
 * Enough base points per second to resolve single frames at the timeline's
 * maximum zoom of 1000 px/s, like toy-midi's recorder.
 */
export const WAVEFORM_POINTS_PER_SECOND = 800;

/** Builds peaks from the buffer's first channel, scaled so the loudest peak is 1. */
export function createAudioView(buffer: AudioBuffer): AudioView {
  const samples = buffer.getChannelData(0);
  const samplesPerPoint = Math.floor(
    buffer.sampleRate / WAVEFORM_POINTS_PER_SECOND,
  );
  const data = new Array<number>(
    Math.ceil(samples.length / samplesPerPoint),
  ).fill(0);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const point = Math.floor(i / samplesPerPoint);
    data[point] = Math.max(data[point], Math.abs(samples[i]));
    peak = Math.max(peak, data[point]);
  }
  // Camera audio only serves sync and is often quiet, so the shape matters
  // more than the level.
  if (peak > 0) {
    for (let i = 0; i < data.length; i++) {
      data[i] /= peak;
    }
  }
  return { data, samplesPerPoint, sampleRate: buffer.sampleRate };
}

// Query a visible range at a fixed target point density, independent of culling bounds.
// Returns data plus actual time bounds (aligned to data boundaries) for renderer positioning
export function queryAudioView(
  view: AudioView,
  {
    start,
    end,
    pointsPerSecond,
  }: {
    start: number;
    end: number;
    pointsPerSecond: number;
  },
): AudioViewSlice {
  const { data, samplesPerPoint, sampleRate } = view;
  const emptySlice: AudioViewSlice = { data: [], actualStart: 0, actualEnd: 0 };

  // Convert seconds to data indices via sample indices (exact math)
  const startIdx = Math.max(
    0,
    Math.floor((start * sampleRate) / samplesPerPoint),
  );
  const endIdx = Math.max(
    0,
    Math.min(data.length, Math.ceil((end * sampleRate) / samplesPerPoint)),
  );
  if (endIdx <= startIdx) {
    return emptySlice;
  }

  // Choose the second-stage pooling factor for the requested point density.
  const alignmentStep = Math.max(
    1,
    Math.round(sampleRate / samplesPerPoint / pointsPerSecond),
  );
  // Anchor pooling buckets at source index 0 rather than the moving startIdx.
  // Scrolling then selects and clips the same global buckets instead of
  // shifting every max-pooling window with the viewport.
  const alignedStartIdx = Math.floor(startIdx / alignmentStep) * alignmentStep;
  const alignedEndIdx = Math.ceil(endIdx / alignmentStep) * alignmentStep;
  const actualStart = (alignedStartIdx * samplesPerPoint) / sampleRate;
  const actualEnd = (alignedEndIdx * samplesPerPoint) / sampleRate;

  // At or above source resolution, no pooling is needed.
  if (alignmentStep === 1) {
    return {
      data: data.slice(alignedStartIdx, alignedEndIdx),
      actualStart,
      actualEnd,
    };
  }

  // Each output point covers exactly `alignmentStep` source points, and
  // windows are aligned to global multiples of alignmentStep.
  const result: number[] = [];
  for (let idx = alignedStartIdx; idx < alignedEndIdx; idx += alignmentStep) {
    let max = 0;
    for (let j = idx; j < idx + alignmentStep; j++) {
      max = Math.max(max, data[j] ?? 0);
    }
    result.push(max);
  }
  return { data: result, actualStart, actualEnd };
}
