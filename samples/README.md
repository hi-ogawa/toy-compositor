# Sample bundles

Each ZIP is self-contained, with a `project.json` entry point, a `media/` directory, and optionally other project variants. Source paths are relative to the project file.

`synthetic.zip` is a small committed fixture with three seconds of H.264/AAC video, a separate WAV tone, and a PNG image. Reproduce it with `pnpm demo:generate`, which needs ffmpeg and zip. Generated loose files stay under `.local/` and are removed after packaging.

Other ZIPs are gitignored. Put a local bundle such as `rescene.zip` in the main worktree's `samples/`, then use it from any worktree:

```sh
pnpm demo:setup synthetic.zip
pnpm demo:setup rescene.zip
```

Setup looks in the current worktree's `samples/` first, then in main's `samples/`. It unpacks into `.local/samples/<name>/` and preserves existing files, so local project edits survive reruns. To start again from the bundle, remove that sample's local directory and run setup again.

On an editor branch, open `.local/samples/<name>/project.json` with `pnpm dev`. On main, use the render CLI. Preparing samples needs unzip.

## Local RESCENE reference

`rescene.zip` contains the four RESCENE deliverable projects and their camera, score, mix, and MV thumbnail sources. `project.json` is the horizontal-video project. The ZIP is kept in main locally, and no real-cover media is committed.

These projects were transcribed from the finished Kdenlive composition. The original project JSON, archive fetch script, and layout notes are preserved at [11e9808](https://github.com/hi-ogawa/toy-compositor/tree/11e9808/covers/2026-06-27-rescene-love-attack). The horizontal values were copied directly. The vertical layout maps the Kdenlive center window to a native 1080×1920 canvas. The [compiler results](../docs/compiler.md) and [Remotion comparison](../research/remotion/README.md) record the render checks.

To prepare another local bundle, zip its `project.json`, `media/`, and any additional project variants into main's `samples/<name>.zip`. Keep project paths relative and keep renders outside the bundle.
