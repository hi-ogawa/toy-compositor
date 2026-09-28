# toy-compositor

A small video compositor for bass-cover videos. It composes finished media from a JSON project, adjusts it in a browser editor, and renders with ffmpeg.

## Features

- Describe each deliverable as a plain JSON project of video, audio, image, text, and color layers ([project format](docs/project-format.md)).
- Browse projects on a start page, preview each layer's source media, and adjust layout in an inspector.
- Render videos and stills through one ffmpeg filter graph ([compiler](docs/compiler.md)).
- Run it as a `toy-compositor` CLI against a folder of projects.

## Usage

```sh
pnpm add -g https://pkg.pr.new/hi-ogawa/toy-compositor@main
toy-compositor serve [root]                    # default ~/Documents/toy-compositor
toy-compositor render <project.json> <output>  # .mp4 or .png
```

Rendering needs `ffmpeg`, `ffprobe`, and ImageMagick (`magick`) on PATH.

## Development

```sh
pnpm install
pnpm dev
```

See [docs/development.md](docs/development.md).
