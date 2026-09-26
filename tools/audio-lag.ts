// Estimate the audio lag between two media files by cross-correlation.
//
// Usage: node tools/audio-lag.ts <a> <b> [--max-lag-ms 100]
//
// A positive lag means audio in <a> comes later than in <b>.

import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const RATE = 8000;

function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { "max-lag-ms": { type: "string", default: "100" } },
  });
  const [fileA, fileB] = positionals;
  if (!fileA || !fileB) {
    console.error("Usage: node tools/audio-lag.ts <a> <b> [--max-lag-ms 100]");
    process.exit(1);
  }
  let a = decode(fileA);
  let b = decode(fileB);
  const n = Math.min(a.length, b.length);
  a = a.subarray(0, n);
  b = b.subarray(0, n);

  // corr[k] = sum over t of a[t + k] * b[t], through the spectrum a * conj(b).
  const size = 2 ** Math.ceil(Math.log2(2 * n));
  const [aRe, aIm] = [padded(a, size), new Float64Array(size)];
  const [bRe, bIm] = [padded(b, size), new Float64Array(size)];
  fft(aRe, aIm);
  fft(bRe, bIm);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    re[i] = aRe[i] * bRe[i] + aIm[i] * bIm[i];
    // Conjugated for the inverse transform below.
    im[i] = -(aIm[i] * bRe[i] - aRe[i] * bIm[i]);
  }
  fft(re, im);

  const maxLag = Math.floor((Number(values["max-lag-ms"]) * RATE) / 1000);
  let lag = 0;
  let best = -Infinity;
  for (let k = -maxLag; k <= maxLag; k++) {
    const value = re[(k + size) % size] / size;
    if (value > best) {
      best = value;
      lag = k;
    }
  }
  const peak = best / Math.sqrt(sumOfSquares(a) * sumOfSquares(b));
  console.log(
    `lag ${((lag * 1000) / RATE).toFixed(2)}ms, correlation ${peak.toFixed(3)}`,
  );
}

function decode(file: string): Float64Array {
  const pcm = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE)].concat([
      "-f",
      "s16le",
      "-",
    ]),
    { maxBuffer: 2 ** 31 - 1 },
  );
  const samples = new Float64Array(pcm.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = pcm.readInt16LE(2 * i);
  }
  return samples;
}

function padded(x: Float64Array, size: number) {
  const out = new Float64Array(size);
  out.set(x);
  return out;
}

function sumOfSquares(x: Float64Array) {
  let sum = 0;
  for (const v of x) {
    sum += v * v;
  }
  return sum;
}

// In-place iterative radix-2 FFT. The length must be a power of two.
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (-2 * Math.PI) / len;
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(angle * k);
      const wi = Math.sin(angle * k);
      for (let i = k; i < n; i += len) {
        const xr = re[i + half] * wr - im[i + half] * wi;
        const xi = re[i + half] * wi + im[i + half] * wr;
        re[i + half] = re[i] - xr;
        im[i + half] = im[i] - xi;
        re[i] += xr;
        im[i] += xi;
      }
    }
  }
}

main();
