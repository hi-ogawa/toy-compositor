# Getting started

## Install

```sh
pnpm add -g https://pkg.pr.new/hi-ogawa/toy-compositor@main
toy-compositor --help  # commands, and paths of the bundled docs and sample
```

On Linux, `toy-compositor install-desktop` adds an app launcher entry that runs `toy-compositor serve --open`, which opens the editor in the browser and exits shortly after the last editor tab closes. `toy-compositor status` shows whether the editor server is running, and `toy-compositor stop` stops it.

`toy-compositor upgrade` installs the latest main build, rewrites the launcher entry, and stops the running editor server, so the next launch uses the new build. It also takes a pkg.pr.new URL or a tarball to install another build, such as a pull request's.

The editor and the renderer rewrite project files from an older build to the current format when they open them and report what changed, or reject one with a message naming the command that fixes it, such as `update-media`. `toy-compositor migrate <project.json...>` rewrites them to the current format, for example before your own scripts read them.

## Project folders

A project folder holds its project files at the top level and their media under `media/`. Each project file describes one deliverable, such as a video or its thumbnail, and its layers refer to media by paths relative to the folder, such as `media/clip.mp4`. The editor's library lists the files in `media/`.

The editor's start page lists the folders you add with `toy-compositor add`, `toy-compositor serve <folder>`, or the start page itself. It keeps that list in `projects.json` under the user config directory, and `toy-compositor --help` prints its path. The editor only serves files inside the added folders, so a layer whose media sits outside its folder does not load in the editor.

`toy-compositor --help` prints the paths of this doc and of the bundled synthetic sample, a project folder with a video project, `project.json`, and its still thumbnail, `thumbnail.json`.

## From media to a render

1. Make a project folder and put media files in its `media/`. Pre-process camera footage first, especially from a phone, as described in [pre-processing](preprocessing.md).
2. Write a project file in the folder following the [project format](project-format.md). To start from the sample, copy its `project.json` and replace its layers with ones for your media, because its layers use the sample's own `media/` files. To try the sample itself first, copy the whole sample folder. Alternatively, create a project from the editor's start page and add layers from the library.
3. Run `toy-compositor update-media <project.json>`. The editor and renderer reject a project until its `media` records every file its layers use, and a rerun is needed whenever a media file changes. Adding a layer in the editor records its media on its own.
4. Render a still, like the sample's `thumbnail.json`, with `toy-compositor render <project.json> <output.png>` to check the layout, then render the video to an `.mp4`.
5. Run `toy-compositor serve <folder>` to adjust the layout in the editor, which saves back to the project file.

## Requirements

Rendering needs `ffmpeg`, `ffprobe`, and ImageMagick (`magick`) on PATH. Text layers render through ImageMagick, so their font must be installed, such as DejaVu Sans for the sample's text layer.
