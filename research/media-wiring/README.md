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

The existing [cover fetch script](../../covers/2026-06-27-rescene-love-attack/fetch.sh) reproduces the source files from the archive. With those files under the cover's gitignored `media/` directory, run:

```sh
pnpm dev covers/2026-06-27-rescene-love-attack/horizontal-video.json
```

Select camera, score, or mix and use the native controls. To check an image, open `horizontal-thumbnail.json` and select mv-thumbnail. Source media and browser screenshots remain gitignored.
