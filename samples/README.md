# Samples

Each sample directory or ZIP is self-contained, with a `project.json` entry point, a `media/` directory, and optionally other project variants. Source paths are relative to the project file.

`synthetic/` is a small committed fixture with reviewable project JSON, three seconds of H.264/AAC video, a separate WAV tone, and a PNG image. Regenerate its media with `node tools/samples/generate.ts`, which needs ffmpeg. Rendering it also needs ImageMagick (`magick`) with the DejaVu Sans font for its text layer.

Local sample sources are gitignored under `.local/samples/`. Put a local bundle such as `rescene.zip` in the main worktree's `.local/samples/`, then use it from any worktree:

```sh
pnpm setup-sample samples/synthetic
pnpm setup-sample ../toy-compositor/.local/samples/rescene.zip
```

Run setup from the repository root with a relative or absolute source path. It copies a directory or unpacks a ZIP into `.local/projects/<name>/`, where `<name>` is the source basename without its extension. Existing files are preserved, so local project edits survive reruns. To start again from the source sample, remove that sample's local directory and run setup again.

Setup preserves every file in the sample, including additional project variants. On an editor branch, pass any project JSON to `pnpm dev`. On main, pass it to `pnpm render`. Preparing ZIP samples needs unzip.

## Synthetic composition

[synthetic/project.json](synthetic/project.json) renders three seconds at 640×360 and 30 fps:

- A moving 320×180 ffmpeg test pattern is scaled to fill the canvas. Its embedded 440 Hz audio is muted.
- A dark gray 160×90 image with a yellow border overlays the video at `(420, 240)` throughout the clip.
- A centered white “Synthetic sample” text layer with a black outline sits on the image throughout the clip.
- A separate 660 Hz WAV tone plays throughout, fading in over the first 0.2 seconds and fading out over the last 0.5 seconds.

The sample exercises video scaling, image placement, text rendering with an outline, source audio muting, and audio fades. `pnpm test-e2e` renders this committed project, checks its output metadata, and checks that the entire video and audio can be decoded without errors.

## Local RESCENE reference

`rescene.zip` contains `horizontal-video.json`, `horizontal-thumbnail.json`, `vertical-video.json`, and `vertical-thumbnail.json`, together with their camera, score, mix, and MV thumbnail sources. `project.json` is an additional copy of `horizontal-video.json` for the default entry point. All five JSON files are unpacked into `.local/projects/rescene/`. The ZIP is kept in main at `.local/samples/rescene.zip`, and no real-cover media is committed.

For example, on an editor branch:

```sh
pnpm dev .local/projects/rescene/project.json
pnpm dev .local/projects/rescene/vertical-video.json
```

These projects were transcribed from the finished Kdenlive composition. The original project JSON, archive fetch script, and layout notes are preserved at [11e9808](https://github.com/hi-ogawa/toy-compositor/tree/11e9808/covers/2026-06-27-rescene-love-attack). The horizontal values were copied directly. The vertical layout maps the Kdenlive center window to a native 1080×1920 canvas. The [compiler results](../docs/compiler.md) and [Remotion comparison](../research/remotion/README.md) record the render checks.

To prepare another local bundle, zip its `project.json`, `media/`, and any additional project variants into main's `.local/samples/<name>.zip`. Keep project paths relative and keep renders outside the bundle.
