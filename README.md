# toy-compositor

A small video compositor that composes finished media from a JSON project, with a browser editor for adjustments and ffmpeg for rendering.

## Features

- Describe each deliverable as a plain JSON project of video, audio, image, text, and color layers ([project format](docs/project-format.md)).
- Open project folders from a start page, preview each layer's source media next to the composed project ([editor](docs/editor.md)), and adjust layout in an inspector.
- Render videos and stills through one ffmpeg filter graph ([compiler](docs/compiler.md)).
- Run it as a `toy-compositor` CLI over the project folders you open.

## Usage

```sh
pnpm add -g https://pkg.pr.new/hi-ogawa/toy-compositor@main
toy-compositor serve [directory]                     # open the editor, adding directory first
toy-compositor serve --open                    # open it in the browser, exiting after the last tab
toy-compositor install-desktop                 # add an app launcher entry that runs serve --open (Linux)
toy-compositor add <path>                      # add a project folder, or a project file's folder
toy-compositor render <project.json> <output>  # .mp4 or .png
toy-compositor update-media <project.json...>  # record the media info layers use
```

A project folder holds its project files at the top level and its media under `media/`. The start page lists the folders you add, kept in `projects.json` under the user config directory such as `~/.config/toy-compositor/`, and the editor only serves files inside them.

Rendering needs `ffmpeg`, `ffprobe`, and ImageMagick (`magick`) on PATH.

## Development

```sh
pnpm install
pnpm dev
```

See [docs/development.md](docs/development.md).
