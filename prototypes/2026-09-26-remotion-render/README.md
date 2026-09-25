# Remotion render prototype

Renders a project file with Remotion, as the first step toward using Remotion Studio as the editor. Studio's preview is Remotion rendering the composition, so it is only useful as an editor if Remotion reproduces what the ffmpeg compiler renders.

One generic `Project` composition takes a project file as its input props. `calculateMetadata` sizes the canvas and duration from the project and probes source sizes, and each layer is drawn with the same fit math as the ffmpeg compiler. The format types are imported from the [ffmpeg compiler prototype](../2026-09-26-ffmpeg-compiler/project.ts), so both renderers read the same format.

```sh
node prototypes/2026-09-26-remotion-render/render.ts <project.json> <output.(mp4|png)>
```

The project file is passed with `--props`, and its folder is passed with `--public-dir`, so `media/...` paths resolve through `staticFile()` without copying media into a `public/` folder.

## Results on the rescene cover (2026-09-26)

Compared against the ffmpeg compiler's output for the same project files ([tools/compare-images.sh](../../tools/compare-images.sh), [tools/audio-lag.py](../../tools/audio-lag.py)).

| Deliverable | Remotion | ffmpeg | Check |
| --- | --- | --- | --- |
| Horizontal thumbnail | 4.5s | 0.6s | SSIM 0.84, title within 1px after the fix below |
| Vertical thumbnail | 2.2s | 0.5s | SSIM 0.92, every region within 1px |
| Vertical video (42s) | 60s | 13s | same duration, frames aligned, audio 42.6ms late |
| Horizontal video (165s) | 235s | 55s | same duration, audio 42.4ms late |

- Layout matches. The camera, score crop, MV thumbnail, dim, and title land within a pixel of the ffmpeg render. The remaining SSIM gap is resampling at scaled edges and glyph rasterization, where Remotion's Chrome text is actually closer to Kdenlive's Qt text than ImageMagick's.
- Timing matches. Both renderers pick the same source frames, and durations match to the frame. Every frame of both videos was compared: SSIM stays between 0.970 and 0.974 on the horizontal video and between 0.956 and 0.960 on the vertical video, with no dips, and all frames decode without black or frozen stretches.
- The whole-video comparison first caught the horizontal video one frame apart, visible as SSIM dips to 0.82 where the score page scrolls. The camera's in-point landed 0.3ms after a source frame, and ffmpeg's seek took the next frame while Remotion showed that one. The compiler now picks the frame whose timestamp is nearest to the source time, which also keeps the thumbnail matching Kdenlive's, and the format defines this rule.
- Remotion's MP4 audio is 42.6ms late, which is 2048 samples at 48kHz. Its audio edit list starts at media time 0, so the AAC encoder's priming samples play instead of being skipped. This is in Remotion's encoding, not in the composition, and it does not matter for an editor preview, because final renders stay on the ffmpeg compiler.
- The first render also downloads Chrome headless shell and bundles the project, which took about 150s once. Later renders reuse the cached bundle.

## Where Remotion's render time goes

Remotion uses the browser as the compositor. It bundles the composition, opens headless Chrome tabs (8 here), and for each frame renders the page and screenshots it, while a native compositor process decodes each `<OffthreadVideo>` frame and hands it to the page as an image. ffmpeg only encodes the screenshots and mixes audio. The ffmpeg compiler instead decodes, composites, and encodes in one filter graph.

A verbose render of the 42s vertical video (64s total) spends 61.4s rendering frames. Bundling takes 1.0s, opening tabs 1.2s, audio 0.1s, and stitching 0.7s. Only about 3 of 16 cores are busy on average.

Splitting the frame cost on a 10s range of the vertical video (300 frames at 1080x1920):

| Variant | Frame rendering |
| --- | --- |
| ffmpeg compiler, whole render | 3.3s |
| No video layers (image, dim, text) | 5.2s |
| Score video only | 9.2s |
| Camera video only | 12.8s |
| Both videos (the real project) | 14.5s |
| Both videos, `--offthreadvideo-video-threads=8` | 14.8s |

The page itself costs about 17ms per frame, and each video layer adds its own cost on top, with the 1080p camera adding the most. More decoder threads change nothing, so the cost is in moving each decoded frame into the page rather than in decoding.

## Text placement

The first comparison had the title 20px higher in Remotion. Two things differed between the renderers, and the format now pins both down (`box.y` is the top of the first line, and line spacing only applies between lines):

- CSS splits a negative line spacing above and below every line box, which moves the first line up by half the spacing. The Remotion text now offsets its top by `-lineSpacing / 2`.
- ImageMagick pads the stroked text PNG by half the outline width, which moved the ffmpeg title down by 5px. The compiler now shifts the PNG back up.

After both fixes the renderers agree within 1px, and both are within 1px to 4px of Kdenlive's title.

## Studio as the editor

```sh
node prototypes/2026-09-26-remotion-render/studio.ts covers/2026-06-27-rescene-love-attack/horizontal-video.json
```

This opens the project in Remotion Studio, and edits in the props panel are written back to the project file.

- The project is passed as default props through a `REMOTION_PROJECT` environment variable rather than `--props`. Studio gives `--props` priority over the props panel, so with `--props` every edit in the panel is ignored.
- Studio's own save cannot target a project file. It rewrites the inline `defaultProps` literal of the `<Composition>` in the root `.tsx` file through a codemod, and here it also reports "Cannot find root file in project". Instead, the composition posts its props to a local endpoint started by `studio.ts` whenever they change in Studio, and the endpoint writes the project file. Changing `output.end` in the panel updated the JSON file on disk.
- A zod schema that mirrors the format lets the panel edit every field of every layer. Numbers can be dragged or typed, and optional fields have an `<undefined>` toggle. The form is one long nested list, so finding a layer means scrolling through all of them.
- In Studio the composition spans the whole timeline rather than only the output range, like a Kdenlive project. Each video and audio layer gets a row for its whole source clip above its own row, labeled with the in and out points in use, the output range has its own row, and the preview is dimmed outside the output range. Renders through `render.ts` still cover only the output range.
- Studio hides sequences created from the same code location as "programmatically duplicated", so every layer would collapse into one row with a `+N` badge. Each layer's sequence and media element get their own `_remotionInternalStack`, an internal Remotion prop, in Studio's `studio-original://` form so it does not try to fetch source maps for them. This may break on Remotion upgrades.

### Camera sync does not work in Studio

The camera audio is a room mic picking up the bass through headphones, so it averages -53dB against the mix's -16dB. Studio draws waveforms without normalizing them, so the camera audio looks flat, and a muted layer (volume 0) shows no waveform at all. On top of that, the sync slap hits are at about 9s in the camera file, before the layer's in-point at 15.7s, and Studio only shows the waveform inside a sequence's range, so the hits are not visible anyway.

Aligning the camera needs a normalized waveform of the whole source around the layer, which Studio cannot show. That points to either a small sync view of our own or automatic alignment by cross-correlation, while Studio could still cover layout and range edits.

### Still to try by hand

- Whether dragging numbers in the panel is acceptable for moving and scaling layers, compared with dragging on the canvas, which Studio does not offer for these props.
- Whether preview playback stays smooth and in sync with the full-size camera file.
