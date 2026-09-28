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
pnpm test-e2e      # editor smoke and synthetic render, needs Chromium, ffmpeg, and ffprobe

pnpm dev                                           # start the editor
pnpm render <project.json> <output.(mp4|png)>                          # render a project
```

Rendering needs `ffmpeg` and ImageMagick (`magick`) on PATH. The editor and the render CLI run on Node 24 directly.

The editor opens the project given by the page's `?project=` query, a path relative to the projects root, for example `/?project=synthetic/project.json`. The dev server's projects root is `.local/projects/`, where `pnpm setup-sample` puts samples, and `TOY_COMPOSITOR_ROOT` overrides it. The server reads, saves, and serves media for the project through `/api/`, and media resolves relative to the project file as in the renderer. Hidden paths under the root are never served.

## CLI

The package ships a `toy-compositor` command with the editor client prebuilt, so it runs without Vite. Each commit is published to [pkg.pr.new](https://pkg.pr.new/~/hi-ogawa/toy-compositor):

```sh
pnpm add -g https://pkg.pr.new/hi-ogawa/toy-compositor@main

toy-compositor serve [root]                      # editor for projects under root, default ~/Documents/toy-compositor
toy-compositor render <project.json> <output>    # render a project
```

`serve` listens on localhost only, rejects requests addressed to other hosts, and serves the editor API over `root` the same way the dev server does over `.local/projects/`. In the repository, `pnpm build` produces `dist/client/` and `dist/server/cli.js`, and `node dist/server/cli.js serve <root>` runs the built CLI.

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
research/     findings from past covers and finished experiments
samples/      committed sample sources
.local/       local sample sources and editable projects, gitignored
tools/        analysis scripts and sample setup/generation
```

## Conventions

- Source media and renders stay gitignored. Small synthetic samples are committed with a generator that reproduces them.
- Project files reference media by paths relative to the project file.
- An experiment that works moves into `src/`. One that does not keeps its findings under `research/<slug>/` and links to its code by commit, so dead code does not stay in the tree.
