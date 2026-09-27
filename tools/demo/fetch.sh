#!/usr/bin/env bash
# Prepare editable RESCENE projects using the main worktree's media cache.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COVER="covers/2026-06-27-rescene-love-attack"
ASSETS=(camera.mp4 score.mp4 mix.wav mv-thumbnail.jpg)
PROJECTS=(horizontal-video.json horizontal-thumbnail.json vertical-video.json vertical-thumbnail.json)
PACK=false
RESET=false
CACHE=""

usage() {
  echo "Usage: $0 [--pack | --reset] [--cache <zip>]"
  echo "  --pack   Build or replace the main worktree's cache from its source media."
  echo "  --reset  Restore local demo JSON from this worktree's committed examples."
}

while (($#)); do
  case "$1" in
    --pack) PACK=true; shift ;;
    --reset) RESET=true; shift ;;
    --cache)
      if (($# < 2)); then usage >&2; exit 1; fi
      CACHE="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 1 ;;
  esac
done
if $PACK && $RESET; then
  echo "Use --pack and --reset separately." >&2
  exit 1
fi

IFS= read -r -d '' MAIN_ENTRY < <(git -C "$ROOT" worktree list --porcelain -z)
MAIN="${MAIN_ENTRY#worktree }"
CACHE="${CACHE:-$MAIN/$COVER/media/rescene-media.zip}"
# Make relative overrides absolute before changing directories to pack media.
if [[ "$CACHE" != /* ]]; then CACHE="$PWD/$CACHE"; fi
DEST="$ROOT/.local/demo/rescene"
TEMP=""
trap 'if [[ -n "$TEMP" ]]; then rm -rf "$TEMP"; fi' EXIT

if $PACK; then
  for asset in "${ASSETS[@]}"; do
    if [[ ! -f "$MAIN/$COVER/media/$asset" ]]; then
      echo "Missing $MAIN/$COVER/media/$asset" >&2
      echo "Fetch the cover's source media with $MAIN/$COVER/fetch.sh, then rerun pnpm demo:cache." >&2
      exit 1
    fi
  done
  mkdir -p "$(dirname "$CACHE")"
  TEMP="$(mktemp -d "$(dirname "$CACHE")/.demo-cache.XXXXXX")"
  ENTRIES=()
  for asset in "${ASSETS[@]}"; do ENTRIES+=("media/$asset"); done
  (cd "$MAIN/$COVER" && zip -q -1 "$TEMP/media.zip" "${ENTRIES[@]}")
  mv "$TEMP/media.zip" "$CACHE"
  echo "Media cache: $CACHE"
  exit 0
fi

MISSING=()
for asset in "${ASSETS[@]}"; do
  if [[ ! -f "$DEST/media/$asset" ]]; then MISSING+=("media/$asset"); fi
done
if ((${#MISSING[@]})); then
  if [[ ! -f "$CACHE" ]]; then
    echo "Missing media cache: $CACHE" >&2
    echo "Run pnpm demo:cache once to pack the main worktree's RESCENE source media, then rerun pnpm demo:setup." >&2
    exit 1
  fi
  for asset in "${ASSETS[@]}"; do
    if ! unzip -Z1 "$CACHE" "media/$asset" >/dev/null; then
      echo "Cache is missing media/$asset. Rebuild it with pnpm demo:cache." >&2
      exit 1
    fi
  done
  mkdir -p "$ROOT/.local/demo"
  TEMP="$(mktemp -d "$ROOT/.local/demo/.rescene.XXXXXX")"
  unzip -q "$CACHE" "${MISSING[@]}" -d "$TEMP"
  mkdir -p "$DEST/media"
  for entry in "${MISSING[@]}"; do mv "$TEMP/$entry" "$DEST/$entry"; done
fi

mkdir -p "$DEST"
for project in "${PROJECTS[@]}"; do
  if $RESET || [[ ! -e "$DEST/$project" ]]; then
    # Use committed examples even if the working tree has local edits.
    git -C "$ROOT" show "HEAD:$COVER/$project" > "$DEST/$project.tmp"
    mv "$DEST/$project.tmp" "$DEST/$project"
  fi
done

echo "Demo projects: $DEST"
echo "Editor branches: pnpm dev .local/demo/rescene/horizontal-video.json"
echo "Renderer: pnpm render .local/demo/rescene/horizontal-thumbnail.json .local/demo/rescene/out/thumbnail.png"
