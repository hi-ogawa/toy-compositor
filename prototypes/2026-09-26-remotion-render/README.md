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
- Timing matches. Both renderers pick the same source frames (best SSIM at offset 0, with ties from repeated frames in the camera file), and durations match to the frame.
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
