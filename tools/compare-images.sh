#!/usr/bin/env bash
# Compare two same-size images: print SSIM, and write a stacked view and an amplified difference.
# Usage: tools/compare-images.sh <a> <b> <out-prefix>
set -euo pipefail
a="$1"; b="$2"; out="$3"
ffmpeg -v error -i "$a" -i "$b" -lavfi "[0][1]ssim=stats_file=-" -f null - | grep -o 'All:[0-9.]*' || true
ffmpeg -v error -y -i "$a" -i "$b" -filter_complex "[0]scale=iw/2:-1[x];[1]scale=iw/2:-1[y];[x][y]vstack" "$out-stack.jpg"
ffmpeg -v error -y -i "$a" -i "$b" -filter_complex "[0]format=rgb24[x];[1]format=rgb24[y];[x][y]blend=all_mode=difference,lutrgb=r=val*4:g=val*4:b=val*4,scale=iw/2:-1" "$out-diff.jpg"
