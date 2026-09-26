#!/usr/bin/env bash
# Copy this cover's source media from the archive drive into ./media (gitignored).
#
# Usage: covers/2026-06-27-rescene-love-attack/fetch.sh [archive-dir]
set -euo pipefail

SRC="${1:-/run/media/$USER/e-1800/hiroshi/projects}/2026-06-27-rescene-love-attack-john-park"
DEST="$(dirname "$0")/media"
mkdir -p "$DEST"

cp "$SRC/video-processed.mp4" "$DEST/camera.mp4"
cp "$SRC/musescore-Screen Recording 2026-06-28 104534.mp4" "$DEST/score.mp4"
cp "$SRC/rescene-love-attack-john-park-mixed-rev2.wav" "$DEST/mix.wav"
cp "$SRC/youtube-thumbnail-maxdefault.jpg" "$DEST/mv-thumbnail.jpg"
