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

## Samples

Sample ZIPs contain a `project.json` entry point and its media. The small synthetic sample is committed, and real-cover samples stay local:

```sh
pnpm sample:setup synthetic.zip
pnpm sample:setup rescene.zip       # when samples/rescene.zip exists in main

# On a branch with the editor:
pnpm dev .local/samples/synthetic/project.json

# On main, try the renderer:
pnpm render .local/samples/synthetic/project.json .local/samples/synthetic/out/preview.mp4
```

Setup looks in this worktree's `samples/` first, then main's `samples/`, and unpacks into `.local/samples/<name>/`. It needs unzip. Existing files are preserved on reruns, so local edits do not change the bundled examples. See [samples/README.md](samples/README.md) for bundle preparation and the RESCENE reference. `pnpm sample:generate` reproduces the committed synthetic ZIP with ffmpeg and zip.

## Layout

```text
src/          editor and renderer
docs/         design drafts, e.g. the project format
research/     findings from past covers and finished experiments
samples/      self-contained sample ZIPs, with real-cover bundles gitignored
.local/       editable sample projects and extracted media, gitignored
tools/        analysis scripts and sample setup/generation
```

## Conventions

- Source media and renders stay gitignored. Small synthetic sample ZIPs are committed with a generator that reproduces them.
- Project files reference media by paths relative to the project file.
- An experiment that works moves into `src/`. One that does not keeps its findings under `research/<slug>/` and links to its code by commit, so dead code does not stay in the tree.
