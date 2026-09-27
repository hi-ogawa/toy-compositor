# toy-compositor

A focused video compositor for my bass-cover videos, meant to replace the last manual Kdenlive step. It is not a general video editor. It only composes finished media into a few fixed deliverables.

- A cover's inputs are a camera recording of the playthrough, the mixed audio, a scrolling score video from [toy-midi](https://github.com/hi-ogawa/toy-midi), the original MV thumbnail, and a title.
- Each cover ships four deliverables: a horizontal video, its thumbnail, a vertical short, and its thumbnail.
- A readable JSON project file is the source of truth, so agents and scripts can generate and edit projects. A minimal editor is only for the edits that need an eye, such as camera sync against the mix waveform and layer placement.
- Rendering compiles a project into one ffmpeg filter graph. Static layouts of existing media do not need per-frame browser capture, and ffmpeg gives direct control over encoding.

[docs/plan.md](docs/plan.md) is the working plan, [research/kdenlive](research/kdenlive/README.md) records how past covers were composed, [research/remotion](research/remotion/README.md) compares a browser render against the ffmpeg compiler, [docs/project-format.md](docs/project-format.md) drafts the project file, and [docs/compiler.md](docs/compiler.md) describes the renderer.

## Setup

```sh
pnpm install
uv sync            # Python analysis tools under tools/
pnpm lint-check    # format, lint, and typecheck

pnpm render <project.json> <output.(mp4|png)>   # render a project
```

Rendering needs `ffmpeg` and ImageMagick (`magick`) on PATH. The render CLI runs on Node 24 directly.

## Local demo

Keep a self-contained RESCENE bundle in the main worktree, with the four project JSON files and their media. Build it once from the existing cover assets:

```sh
# In the main worktree:
cd covers/2026-06-27-rescene-love-attack
zip -1 media/rescene-demo.zip *.json media/camera.mp4 media/score.mp4 media/mix.wav media/mv-thumbnail.jpg
```

The ZIP stays gitignored alongside the original media. If the assets are missing, run the cover's `fetch.sh` first.

In any worktree, unpack the bundle into a gitignored directory for local iteration:

```sh
pnpm demo:setup

# On a branch with the editor:
pnpm dev .local/demo/rescene/horizontal-video.json

# On main, try the renderer:
pnpm render .local/demo/rescene/horizontal-thumbnail.json .local/demo/rescene/out/thumbnail.png
```

`demo:setup` finds the main worktree through git and unpacks its bundle into `.local/demo/rescene/`. It needs `unzip`. Existing files are preserved on reruns, so saving or reopening the demo does not change the committed examples. The initial JSON comes from the bundle, independent of the current branch.

## Layout

```text
src/
  lib/        project format, layout math, and the ffmpeg compiler
  lib/cli.ts  render CLI
docs/         design drafts, e.g. the project format
research/     findings from past covers and finished experiments
covers/       one folder per real cover used for testing
  <date>-<name>/
    *.json      project files (canvas and layers), one per deliverable
    fetch.sh    copies source media from my archive drive into media/
    media/      source media, gitignored
    out/        renders, gitignored
tools/        analysis scripts for comparing renders
```

## Conventions

- Media, images, and renders are never committed. Raw data lives in gitignored folders, and a `fetch.sh` next to it reproduces it from my archive drive.
- Project files reference media by paths relative to the project file.
- An experiment that works moves into `src/`. One that does not keeps its findings under `research/<slug>/` and links to its code by commit, so dead code does not stay in the tree.
