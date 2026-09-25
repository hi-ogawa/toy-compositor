"""Compare two same-size videos frame by frame with SSIM.

Usage: uv run tools/compare-videos.py <a.mp4> <b.mp4>

Prints the mean and minimum SSIM, the worst frames, and the mean per 300 frames
so a stretch where the renders diverge stands out.
"""

import argparse
import re
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("a")
    parser.add_argument("b")
    args = parser.parse_args()

    with tempfile.NamedTemporaryFile(suffix=".txt") as stats:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", args.a, "-i", args.b]
            + ["-lavfi", f"[0][1]ssim=stats_file={stats.name}", "-f", "null", "-"],
            check=True,
        )
        frames = [
            (int(re.search(r"n:(\d+)", line).group(1)), float(re.search(r"All:([\d.]+)", line).group(1)))
            for line in open(stats.name)
        ]

    values = [v for _, v in frames]
    worst = sorted(frames, key=lambda f: f[1])[:5]
    print(f"frames {len(values)}, mean SSIM {sum(values) / len(values):.4f}, min {min(values):.4f}")
    print("worst frames:", ", ".join(f"{n} ({v:.3f})" for n, v in worst))
    windows: dict[int, list[float]] = {}
    for n, v in frames:
        windows.setdefault((n - 1) // 300, []).append(v)
    print("mean per 300 frames (10s at 30fps):", " ".join(f"{sum(w) / len(w):.3f}" for _, w in sorted(windows.items())))


if __name__ == "__main__":
    main()
