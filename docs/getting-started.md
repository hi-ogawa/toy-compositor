# Getting started

## Project folders

A project folder holds its project files at the top level and their media under `media/`. Each project file describes one deliverable, such as a video or its thumbnail, and its layers refer to media by paths relative to the folder, such as `media/clip.mp4`. The editor's library lists the files in `media/`.

The editor's start page lists the folders you add with `toy-compositor add`, `toy-compositor serve <folder>`, or the start page itself. It keeps that list in `projects.json` under the user config directory, and `toy-compositor --help` prints its path. The editor only serves files inside the added folders, so a layer whose media sits outside its folder does not load in the editor.

`toy-compositor --help` prints the paths of this doc and of the bundled synthetic sample, a project folder with a video project, `project.json`, and its still thumbnail, `thumbnail.json`.

## From media to a render

1. Make a project folder and put media files in its `media/`.
2. Write a project file in the folder, starting from a copy of the sample's `project.json` and following the [project format](project-format.md). Alternatively, create a project from the editor's start page and add layers from the library.
3. Run `toy-compositor update-media <project.json>`. The editor and renderer reject a project until its `media` records every file its layers use, and a rerun is needed whenever a media file changes. Adding a layer in the editor records its media on its own.
4. Render a still, like the sample's `thumbnail.json`, with `toy-compositor render <project.json> <output.png>` to check the layout, then render the video to an `.mp4`.
5. Run `toy-compositor serve <folder>` to adjust the layout in the editor, which saves back to the project file.

## Requirements

Rendering needs `ffmpeg`, `ffprobe`, and ImageMagick (`magick`) on PATH. Text layers render through ImageMagick, so their font must be installed, such as DejaVu Sans for the sample's text layer.
