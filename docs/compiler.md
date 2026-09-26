# ffmpeg compiler

[src/lib/compile.ts](../src/lib/compile.ts) compiles a project file ([project-format.md](project-format.md)) into one ffmpeg command. The graph starts from a solid canvas, overlays each visual layer in order, and mixes the audio of audio layers and unmuted video layers. Text layers are rendered to PNG with ImageMagick first. The render CLI runs on Node 24 directly.

```sh
pnpm render covers/2026-06-27-rescene-love-attack/horizontal-thumbnail.json covers/2026-06-27-rescene-love-attack/out/horizontal-thumbnail.png
pnpm render <project.json> <output> --dry-run   # print the command only
```

## Results on the rescene cover (2026-09-26)

These were measured on the prototype, before it moved into `src/lib`. All four deliverables of [covers/2026-06-27-rescene-love-attack](../covers/2026-06-27-rescene-love-attack/) render and match the Kdenlive outputs.

| Deliverable             | Render time | Output            | Kdenlive output  |
| ----------------------- | ----------- | ----------------- | ---------------- |
| Horizontal thumbnail    | 0.6s        | 1920x1080 PNG     | 1920x1080 JPEG   |
| Vertical thumbnail      | 0.5s        | 1080x1920 PNG     | 608x1080 JPEG    |
| Horizontal video (165s) | 54s         | 134MB, 6.3Mbps    | 107MB, 5.3Mbps   |
| Vertical video (42s)    | 13s         | 28MB at 1080x1920 | 14MB at 608x1080 |

- Layout: side-by-side comparisons of both thumbnails match Kdenlive's, including the score crop, the MV thumbnail, the dim overlay, and the centered title, after mapping the vertical layout to a native 1080x1920 canvas.
- Stills: rendering the horizontal thumbnail at nearby frames and comparing the camera region with Kdenlive's JPEG peaks at the transcribed time (SSIM 0.991).
- Durations: both videos match Kdenlive's to the frame (164.933s and 42.367s).
- Audio: cross-correlation against Kdenlive's renders gives a lag of 0.38ms with correlation 0.99 for both videos (`node tools/audio-lag.ts`).
- Video timing: the first version was one frame (33ms) ahead of Kdenlive's camera. The camera's in-point, 15.733s, lands 0.3ms after a source frame (the stream starts at 0.066s), and ffmpeg's accurate seek starts from the first frame at or after the seek time, so it took the next frame. The compiler now seeks to the frame whose timestamp is nearest to the source time, which matches both Kdenlive and Remotion ([research/remotion](../research/remotion/README.md)).

## Known gaps

- Color metadata is incomplete. The output is BT.709 limited range like the camera source, but only the matrix is tagged, while Kdenlive's render also tags BT.709 transfer and primaries. RGB layers (images, text, color) are likely converted to YUV with ffmpeg's default BT.601 matrix while the file says BT.709, so they may be very slightly off. The fix is to convert with `out_color_matrix=bt709:out_range=tv` and tag the output with `-colorspace bt709 -color_primaries bt709 -color_trc bt709`. It is only visible side by side.

- Encoding uses `libx264 -crf 20 -preset medium`, which comes out about 20% larger than Kdenlive's preset. Tuning is left for later.
- Text is aligned inside its box width through ImageMagick `label:` and gravity, with the outline drawn as a stroked copy underneath. Kdenlive's text item may have a small top margin that is not modeled.
- The filter graph is one command per render, so a still still spawns ffmpeg with every input. That is fast enough at 0.5s for an editor preview, but it has not been tried with longer seeks into large files.
