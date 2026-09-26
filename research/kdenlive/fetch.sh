#!/usr/bin/env bash
# Copy the Kdenlive projects, render logs, and thumbnails of past covers from
# the archive drive into ./projects (gitignored). No media is extracted.
#
# Usage: research/kdenlive/fetch.sh [archive-dir] [dest-dir]
set -euo pipefail

ARCHIVE="${1:-/run/media/$USER/e-1800/hiroshi/projects}"
DEST="${2:-$(dirname "$0")/projects}"
mkdir -p "$DEST"

# 2025 covers are zip archives. Extract only the small files by pattern.
for name in \
  2025-09-30-haechan-love-beyond \
  2025-10-27-riize-boom-boom-bass \
  2025-12-14-arrc-wow \
  2025-12-30-billlie-snowy-night; do
  unzip -o -qq "$ARCHIVE/$name.zip" \
    "$name/*.kdenlive" "$name/*.mp4.log" "$name/thumbnail*.jpg" "$name/thubnail.jpg" \
    -d "$DEST" 2> >(grep -v 'filename not matched' >&2) ||
    [ $? -eq 11 ] # 11: some patterns have no match in this archive
done

# 2026 covers are plain folders.
for name in \
  2026-02-08-billlie-cloud-palace \
  2026-05-30-billlie-beyond-me \
  2026-06-21-triples-baby-flower \
  2026-06-27-rescene-love-attack-john-park; do
  mkdir -p "$DEST/$name"
  find "$ARCHIVE/$name" -maxdepth 1 -type f \( -name '*.kdenlive' -o -name '*.jpg' -o -name '*.png' \) \
    -exec cp {} "$DEST/$name/" \;
done
