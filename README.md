# toy-compositor

A small video compositor for bass-cover videos. You describe a composition as a JSON project, line things up in a browser editor, and render the final videos and thumbnails with ffmpeg.

It's built for one job: taking finished media (a camera recording, the mixed audio, a score video from [toy-midi](https://github.com/hi-ogawa/toy-midi), a thumbnail image, and a title) and composing them into a horizontal video, a vertical short, and a thumbnail for each. It isn't a general video editor.

## Getting started

Install the CLI and open the editor on a folder of projects:

```sh
pnpm add -g https://pkg.pr.new/hi-ogawa/toy-compositor@main

toy-compositor serve                         # projects under ~/Documents/toy-compositor
toy-compositor serve ~/covers                # or any other folder
```

The start page lists your projects. Open one to preview each layer, adjust positions in the inspector, and save. When it looks right, render it:

```sh
toy-compositor render ~/covers/my-cover/horizontal-video.json out.mp4
toy-compositor render ~/covers/my-cover/horizontal-thumbnail.json out.png
```

Rendering needs `ffmpeg` and ImageMagick (`magick`) on your PATH.

## Projects

Each project directory holds one cover: its project files and the media they use.

```text
~/covers/my-cover/
  horizontal-video.json
  horizontal-thumbnail.json
  vertical-video.json
  media/camera.mp4
  media/mix.wav
```

A project file is plain JSON: a canvas, what to render, and a stack of video, audio, image, text, and color layers. Media paths are relative to the project file. Variants like the vertical short are just separate files, so you, a script, or an agent can derive one from another. See [docs/project-format.md](docs/project-format.md).

## How it works

The renderer compiles a project into a single ffmpeg filter graph ([docs/compiler.md](docs/compiler.md)), so the render is exact and encoding is under direct control. The editor previews the same layout in the browser and only writes the project file, so the file is always the source of truth.

Plans and open work live in the [roadmap](https://github.com/hi-ogawa/toy-compositor/issues/43).

## Development

```sh
pnpm install
pnpm dev                        # editor on .local/projects/ (TOY_COMPOSITOR_ROOT to override)
pnpm setup-sample samples/synthetic
pnpm lint-check                 # format, lint, and typecheck
pnpm test-e2e                   # against the built CLI (E2E_SERVER=dev for the dev server)
pnpm build                      # dist/client/ and dist/server/cli.js
```

Node 24 runs the editor and CLI directly. `uv sync` installs the Python tools under `tools/` used to compare renders. See [samples/README.md](samples/README.md) for the synthetic and local samples, and [AGENTS.md](AGENTS.md) for conventions.
