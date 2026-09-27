# ffmpeg compiler

The renderer in [src/lib/render](../src/lib/render) turns a project file ([project-format.md](project-format.md)) into one ffmpeg command and runs it. The render CLI runs on Node 24 directly.

```sh
pnpm setup-sample samples/synthetic
pnpm render .local/projects/synthetic/project.json .local/projects/synthetic/out/preview.mp4
pnpm render <project.json> <output> --dry-run   # print the command only
```

## Gather Facts, Compile, Run

A render has three steps. First, it gathers what the project file cannot say about its media. Each video and image source is probed once for its size, frame timing, and whether it has audio, and each text layer is drawn to a transparent PNG with ImageMagick. Then the project and those facts are compiled into ffmpeg arguments. Finally, ffmpeg runs.

![The project file flows through resolving media, compiling, and running ffmpeg, and only the first and last steps touch files or processes](images/render-pipeline.svg)

Compiling reads no files and starts no processes, so it is plain data in and arguments out. All the I/O sits at the two ends. `--dry-run` stops before running ffmpeg, but it still probes the sources and writes the text PNGs, because the printed command refers to them.

## Cut Each Layer to the Output

Every layer is compiled on its own, into at most one picture stream and one sound stream. A layer does not need to know which other layers exist.

First, a layer is cut to the part that falls inside the output range. A video or audio layer spans from its `start` for the length of its source range. An image, text, or color layer spans from `start` to `end`, and a missing edge runs to the edge of the output. A layer with no visible part contributes nothing.

![Three layers against a four-second output range, where only the parts inside the range become streams, each placed by its offset from the output start](images/layer-timing.svg)

Each stream is trimmed to that visible part when ffmpeg reads the input, then shifted by its offset from the output start. For a video layer, trimming means seeking the source to the matching source time. Because project times are rounded to milliseconds, the seek targets the source frame nearest to that time rather than the first frame after it.

What each layer type turns into:

| Layer | Picture                                                                    | Sound                       |
| ----- | -------------------------------------------------------------------------- | --------------------------- |
| Video | Source frames at the canvas rate, cropped, then scaled to fit its box      | Its own audio, unless muted |
| Image | The image repeated at the canvas rate, cropped, then scaled to fit its box | None                        |
| Text  | The text PNG repeated at the canvas rate, placed at its box                | None                        |
| Color | A generated solid fill with opacity, over its box or the whole canvas      | None                        |
| Audio | None                                                                       | Its audio, unless muted     |

Sound is normalized to 48 kHz stereo, faded in and out when the layer asks for it, and delayed to its offset.

## Stack Pictures, Mix Sounds

Once every layer has its streams, one pass joins them into a single filter graph. The picture chain starts from a solid canvas covering the whole output. Each picture is overlaid on the result so far at its position, in layer order, so later layers sit on top. When a picture stream ends before the output does, the layers below show through. Every sound goes into one mix, which is padded or trimmed to the output length.

![Pictures from the video, image, and text layers stack over a solid canvas in order, while the audio layer goes to a separate mix](images/graph-assembly.svg)

This pass is the only place that knows how streams are numbered and connected. The per-layer step only says what a layer contributes, which keeps each layer type readable on its own. To see the actual graph for a project, run the render with `--dry-run`.

## Stills

A project whose `output` is a still renders the same graph over a single frame. The output range becomes one frame long starting at the still's time, no layer contributes sound, and ffmpeg writes one image file instead of encoding a video. A thumbnail therefore only decodes each source around its time, however long the source is.

## Results on the rescene cover (2026-09-26)

These were measured on the prototype, before it moved into `src/lib`. All four deliverables of the [RESCENE reference sample](../samples/README.md#local-rescene-reference) render and match the Kdenlive outputs.

| Deliverable             | Render time | Output            | Kdenlive output  |
| ----------------------- | ----------- | ----------------- | ---------------- |
| Horizontal thumbnail    | 0.6s        | 1920x1080 PNG     | 1920x1080 JPEG   |
| Vertical thumbnail      | 0.5s        | 1080x1920 PNG     | 608x1080 JPEG    |
| Horizontal video (165s) | 54s         | 134MB, 6.3Mbps    | 107MB, 5.3Mbps   |
| Vertical video (42s)    | 13s         | 28MB at 1080x1920 | 14MB at 608x1080 |

- Layout: side-by-side comparisons of both thumbnails match Kdenlive's, including the score crop, the MV thumbnail, the dim overlay, and the centered title, after mapping the vertical layout to a native 1080x1920 canvas.
- Stills: rendering the horizontal thumbnail at nearby frames and comparing the camera region with Kdenlive's JPEG peaks at the transcribed time (SSIM 0.991).
- Durations: both videos match Kdenlive's to the frame (164.933s and 42.367s).
- Audio: cross-correlation against Kdenlive's renders gives a lag of 0.38ms with correlation 0.99 for both videos (`uv run tools/audio-lag.py`).
- Video timing: the first version was one frame (33ms) ahead of Kdenlive's camera. The camera's in-point, 15.733s, lands 0.3ms after a source frame (the stream starts at 0.066s), and ffmpeg's accurate seek starts from the first frame at or after the seek time, so it took the next frame. The compiler now seeks to the frame whose timestamp is nearest to the source time, which matches both Kdenlive and Remotion ([research/remotion](../research/remotion/README.md)).

## Known gaps

- Color metadata is incomplete. The output is BT.709 limited range like the camera source, but only the matrix is tagged, while Kdenlive's render also tags BT.709 transfer and primaries. RGB layers (images, text, color) are likely converted to YUV with ffmpeg's default BT.601 matrix while the file says BT.709, so they may be very slightly off. The fix is to convert with `out_color_matrix=bt709:out_range=tv` and tag the output with `-colorspace bt709 -color_primaries bt709 -color_trc bt709`. It is only visible side by side.

- Encoding uses `libx264 -crf 20 -preset medium`, which comes out about 20% larger than Kdenlive's preset. Tuning is left for later.
- Text is aligned inside its box width through ImageMagick `label:` and gravity, with the outline drawn as a stroked copy underneath. Kdenlive's text item may have a small top margin that is not modeled.
- The filter graph is one command per render, so a still still spawns ffmpeg with every input. That is fast enough at 0.5s for an editor preview, but it has not been tried with longer seeks into large files.
