# toy-compositor

A focused video compositor for my bass-cover videos, meant to replace the last manual Kdenlive step. It is not a general video editor. It only composes finished media into a few fixed deliverables.

- A cover's inputs are a camera recording of the playthrough, the mixed audio, a scrolling score video from [toy-midi](https://github.com/hi-ogawa/toy-midi), the original MV thumbnail, and a title.
- Each cover ships four deliverables: a horizontal video, its thumbnail, a vertical short, and its thumbnail.
- A readable JSON project file is the source of truth, so agents and scripts can generate and edit projects. A minimal editor is only for the edits that need an eye, such as camera sync against the mix waveform and layer placement.
- Rendering compiles a project into one ffmpeg filter graph. Static layouts of existing media do not need per-frame browser capture, and ffmpeg gives direct control over encoding.

The pinned [roadmap issue](https://github.com/hi-ogawa/toy-compositor/issues/43) is the working plan, [past Kdenlive covers](https://github.com/hi-ogawa/toy-compositor/tree/e315663/research/kdenlive) record how covers were composed, [a Remotion comparison](https://github.com/hi-ogawa/toy-compositor/tree/e315663/research/remotion) checks a browser render against the ffmpeg compiler, [docs/project-format.md](docs/project-format.md) drafts the project file, and [docs/compiler.md](docs/compiler.md) describes the renderer.

## Setup

```sh
pnpm install
uv sync            # Python analysis tools under tools/
pnpm lint-check    # format, lint, and typecheck
pnpm test-e2e      # editor smoke and synthetic render, needs Chromium, ffmpeg, and ffprobe

pnpm dev .local/projects/synthetic/project.json   # edit a prepared sample project
pnpm render <project.json> <output.(mp4|png)>                          # render a project
```

Rendering needs `ffmpeg` and ImageMagick (`magick`) on PATH. The editor and the render CLI run on Node 24 directly.

## Samples

```sh
pnpm setup-sample samples/synthetic
pnpm setup-sample ../toy-compositor/.local/samples/rescene.zip

pnpm render .local/projects/synthetic/project.json .local/projects/synthetic/out/preview.mp4
```

See [samples/README.md](samples/README.md) for setting up the synthetic sample or a local project bundle for iteration.

## Layout

```text
src/          editor and renderer
docs/         design drafts, e.g. the project format
samples/      committed sample sources
.local/       local sample sources and editable projects, gitignored
tools/        analysis scripts and sample setup/generation
```

## Conventions

- Source media and renders stay gitignored. Small synthetic samples are committed with a generator that reproduces them.
- Project files reference media by paths relative to the project file.
- An experiment that works moves into `src/`. One that does not is removed, and its code and findings are linked by commit, so dead code and historical notes do not stay in the tree.
