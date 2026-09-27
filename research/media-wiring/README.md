# Media wiring probe

The editor can preview one selected layer's full source file through `/api/media/`. Video and audio use browser controls for play, pause, and seek, and image layers display their source. This proves browser media delivery without introducing composition or transport. Project timing, crops, boxes, fades, and mute settings do not affect this source preview.

## Findings

Checked in headless Google Chrome with the actual RESCENE cover sources, rather than generated sample media:

- Camera H.264 video loaded at 1920×1080, played, paused, and sought to 60 seconds.
- Score H.264 video loaded at 1244×628, played, paused, and sought to 60 seconds.
- Mix WAV audio loaded, played, paused, and sought to 100 seconds. This checks element playback state, rather than listening to speaker output.
- The original thumbnail image loaded using the horizontal-thumbnail project's layer data.
- Chrome received HTTP 206 responses when loading and seeking media.
- Switching layers removed the previous media element. Selecting text showed the source-selection prompt. No browser exceptions occurred.

`pnpm lint` and a production Vite build passed. The implementation stays in `src/components/media-preview.tsx` as the minimal source viewer. Editor composition and transport can follow toy-midi's patterns separately.

## Try it

Prepare an editable sample using [the sample setup](../../samples/README.md):

```sh
pnpm setup-sample samples/synthetic
pnpm dev .local/projects/synthetic/project.json

# For the local RESCENE bundle:
pnpm setup-sample ../toy-compositor/.local/samples/rescene.zip
pnpm dev .local/projects/rescene/project.json
```

Select a video, audio, or image layer to preview its full source. For RESCENE, select camera, score, or mix and use the native controls. To check its image, open `.local/projects/rescene/horizontal-thumbnail.json` and select mv-thumbnail. Local projects, source media, renders, and probe screenshots stay under the gitignored `.local/` directory.
