# toy-compositor

A focused video compositor for my bass-cover videos, meant to replace the last manual Kdenlive step. It is not a general video editor. It only composes finished media into a few fixed deliverables.

- A cover's inputs are a camera recording of the playthrough, the mixed audio, a scrolling score video from [toy-midi](https://github.com/hi-ogawa/toy-midi), the original MV thumbnail, and a title.
- Each cover ships four deliverables: a horizontal video, its thumbnail, a vertical short, and its thumbnail.
- A readable JSON project file is the source of truth, so agents and scripts can generate and edit projects. A minimal editor is only for the edits that need an eye, such as camera sync against the mix waveform and layer placement.
- Rendering compiles a project into one ffmpeg filter graph. Static layouts of existing media do not need per-frame browser capture, and ffmpeg gives direct control over encoding.

This repo is at the prototype stage. [research/kdenlive](research/kdenlive/README.md) records how past covers were composed, [docs/project-format.md](docs/project-format.md) drafts the project file, and [prototypes/](prototypes/) holds experiments.

## Setup

```sh
pnpm install       # TypeScript for typechecking, prototypes run on Node 24 directly
uv sync            # Python analysis tools under tools/
pnpm typecheck
```

Rendering needs `ffmpeg` and ImageMagick (`magick`) on PATH.

## Layout

```text
docs/         design drafts, e.g. the project format
research/     findings about the current workflow, e.g. research/kdenlive/
covers/       one folder per real cover used for testing
  <date>-<name>/
    *.json      project files (canvas and layers), one per deliverable
    fetch.sh    copies source media from my archive drive into media/
    media/      source media, gitignored
    out/        renders, gitignored
prototypes/   one folder per experiment, self-contained with its own deps
  <date>-<slug>/
tools/        analysis scripts for comparing renders
```

## Conventions

- Media, images, and renders are never committed. Raw data lives in gitignored folders, and a `fetch.sh` next to it reproduces it from my archive drive.
- Project files reference media by paths relative to the project file.
- Each prototype is self-contained, so one can be deleted without touching the others. A prototype that works graduates into a real package later.
