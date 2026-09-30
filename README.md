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
toy-compositor --help
```

The help lists the commands and a getting-started walkthrough, and points to the [project format](docs/project-format.md) and the [synthetic sample](samples/synthetic) bundled in the installed package.

A project folder holds its project files at the top level and its media under `media/`. The start page lists the folders you add, kept in `projects.json` under the user config directory such as `~/.config/toy-compositor/`, and the editor only serves files inside them.

## Development

```sh
pnpm install
pnpm dev
```

See [docs/development.md](docs/development.md).
