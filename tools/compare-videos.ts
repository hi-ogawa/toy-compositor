// Compare two same-size videos frame by frame with SSIM.
//
// Usage: node tools/compare-videos.ts <a.mp4> <b.mp4>
//
// Prints the mean and minimum SSIM, the worst frames, and the mean per 300
// frames so a stretch where the renders diverge stands out.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error("Usage: node tools/compare-videos.ts <a.mp4> <b.mp4>");
    process.exit(1);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compare-videos-"));
  const stats = path.join(dir, "ssim.txt");
  try {
    execFileSync("ffmpeg", [
      ...["-v", "error", "-i", fileA, "-i", fileB],
      ...["-lavfi", `[0][1]ssim=stats_file=${stats}`, "-f", "null", "-"],
    ]);
    const frames = fs
      .readFileSync(stats, "utf-8")
      .trim()
      .split("\n")
      .map((line) => ({
        n: Number(/n:(\d+)/.exec(line)![1]),
        ssim: Number(/All:([\d.]+)/.exec(line)![1]),
      }));
    report(frames);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function report(frames: { n: number; ssim: number }[]) {
  const values = frames.map((f) => f.ssim);
  const worst = [...frames].sort((x, y) => x.ssim - y.ssim).slice(0, 5);
  console.log(
    `frames ${values.length}, mean SSIM ${mean(values).toFixed(4)}, min ${Math.min(...values).toFixed(4)}`,
  );
  console.log(
    "worst frames:",
    worst.map((f) => `${f.n} (${f.ssim.toFixed(3)})`).join(", "),
  );
  const windows: number[][] = [];
  for (const { n, ssim } of frames) {
    (windows[Math.floor((n - 1) / 300)] ??= []).push(ssim);
  }
  console.log(
    "mean per 300 frames (10s at 30fps):",
    windows.map((w) => mean(w).toFixed(3)).join(" "),
  );
}

function mean(values: number[]) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

main();
