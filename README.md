# toy-compositor

A small video compositor that composes finished media from a JSON project, with a browser editor for adjustments and ffmpeg for rendering.

## Features

- Describe each deliverable as a plain JSON project of video, audio, image, text, and color layers ([project format](docs/project-format.md)).
- Browse projects on a start page, preview each layer's source media next to the composed project ([editor preview](docs/editor-preview.md)), and adjust layout in an inspector.
- Render videos and stills through one ffmpeg filter graph ([compiler](docs/compiler.md)).
- Run it as a `toy-compositor` CLI against a folder of projects.

## Usage

```sh
pnpm add -g https://pkg.pr.new/hi-ogawa/toy-compositor@main
toy-compositor serve [root]                    # default ~/Documents/toy-compositor
toy-compositor render <project.json> <output>  # .mp4 or .png
toy-compositor probe <project.json...>          # record media facts in sources
```

Rendering needs `ffmpeg`, `ffprobe`, and ImageMagick (`magick`) on PATH.

## Development

```sh
pnpm install
pnpm dev
```

See [docs/development.md](docs/development.md).
