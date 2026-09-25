"""Estimate the audio lag between two media files by cross-correlation.

Usage: uv run tools/audio-lag.py <a> <b> [--max-lag-ms 100]

A positive lag means audio in <a> comes later than in <b>.
"""

import argparse
import subprocess

import numpy as np

RATE = 8000


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("a")
    parser.add_argument("b")
    parser.add_argument("--max-lag-ms", type=float, default=100)
    args = parser.parse_args()

    a, b = decode(args.a), decode(args.b)
    n = min(len(a), len(b))
    a, b = a[:n], b[:n]
    size = 1 << int(np.ceil(np.log2(2 * n)))
    corr = np.fft.irfft(np.fft.rfft(a, size) * np.conj(np.fft.rfft(b, size)), size)
    max_lag = int(args.max_lag_ms * RATE / 1000)
    window = np.r_[corr[-max_lag:], corr[: max_lag + 1]]
    lag = int(np.argmax(window)) - max_lag
    peak = window.max() / np.sqrt((a * a).sum() * (b * b).sum())
    print(f"lag {lag * 1000 / RATE:.2f}ms, correlation {peak:.3f}")


def decode(file: str) -> np.ndarray:
    pcm = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", file, "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32)


if __name__ == "__main__":
    main()
