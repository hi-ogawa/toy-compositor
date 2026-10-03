# toy-compositor

A small video editor that keeps each project as a plain JSON file and renders it with ffmpeg. The editor runs in the browser over project folders on your machine, and because a project is readable JSON, a script or an agent can write or change it as easily as the editor can.

The [demo](https://toy-compositor.hiro18181.workers.dev) opens the editor on the bundled sample without a server, keeping edits in the browser tab.

## Features

- Compose video, audio, image, text, and color layers on a fixed canvas, with each deliverable, such as a video and its thumbnail, as its own project file ([project format](docs/project-format.md)).
- Add layers from a folder's media, move and trim them on a timeline, place them in an inspector, and play the composition with audio ([editor](docs/editor.md)).
- Render videos and stills through one ffmpeg filter graph ([compiler](docs/compiler.md)).

## Usage

```sh
pnpm add -g https://pkg.pr.new/hi-ogawa/toy-compositor@main
toy-compositor --help                          # commands, and paths of the bundled docs and sample
toy-compositor serve [directory]               # open the editor, adding directory first
toy-compositor serve --open                    # open it in the browser, exiting after the last tab
toy-compositor stop                            # stop the running editor server
toy-compositor status                          # show whether the editor server is running
toy-compositor install-desktop                 # add an app launcher entry that runs serve --open (Linux)
toy-compositor add <path>                      # add a project folder, or a project file's folder
toy-compositor render <project.json> <output>  # .mp4 or .png
toy-compositor update-media <project.json...>  # record the media info layers use
```

See [getting started](docs/getting-started.md) for project folders and going from media to a render. Rendering needs `ffmpeg`, `ffprobe`, and ImageMagick (`magick`) on PATH.

## Development

```sh
pnpm install
pnpm dev
```

See [docs/development.md](docs/development.md).
