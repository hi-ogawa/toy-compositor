# Project format (draft)

A project is one JSON file that describes one deliverable: a canvas, what to render, and a stack of layers. Variants of a cover, such as the horizontal video and its thumbnail, are separate files that share timing values. This draft is derived from the Kdenlive findings in [research/kdenlive/](../research/kdenlive/README.md) and is expected to change as prototypes run into gaps.

```jsonc
{
  "canvas": { "width": 1920, "height": 1080, "fps": 30, "background": "#000000" },
  "output": { "type": "video", "start": 23.7, "end": 188.633 },
  // or { "type": "still", "time": 106.833 }
  "layers": [
    // bottom to top
  ]
}
```

## Time

All times are seconds. Timeline times (`start`, `end`, `output.*`) are positions on the project timeline. Source times (`in`, `out`) are positions in a media file.

A video or audio layer plays its source from `in` to `out`, starting at timeline position `start`. Alignment can be expressed through either `start` or `in`, because moving both by the same amount is a no-op.

Image, text, and color layers are visible for the whole output unless they set `start` or `end`.

## Layers

### `video`

```jsonc
{ "type": "video", "src": "media/camera.mp4", "start": 23.7, "in": 15.733, "out": 180.633,
  "box": { "x": 0, "y": 0, "width": 1920, "height": 1080 },
  "crop": { "left": 0.013, "top": 0.0065 } }
```

Video layers contribute frames only. A video file's audio is used by adding an `audio` layer with the same `src`, so camera audio can stay available for sync in the editor without being part of the mix.

### `audio`

```jsonc
{ "type": "audio", "src": "media/mix.wav", "start": 23.7, "in": 10.333, "out": 175.233,
  "fadeIn": 0, "fadeOut": 4.7 }
```

`fadeIn` and `fadeOut` are durations in seconds at the edges of the layer's visible range, which is the source range clipped to the output range.

### `image`

```jsonc
{ "type": "image", "src": "media/mv-thumbnail.jpg", "box": { "x": 960, "y": 540, "width": 960, "height": 540 } }
```

### `text`

```jsonc
{ "type": "text", "text": "RESCENE\nLOVE ATTACK\n(John Park ver.)",
  "box": { "x": 336, "y": 222, "width": 1247 }, "align": "center",
  "font": { "family": "Noto Sans CJK KR", "size": 160, "weight": 700, "lineSpacing": -30 },
  "color": "#ffffff", "outline": { "width": 10, "color": "#000000" } }
```

Text is rendered to a transparent PNG and composited like an image, so the renderer does not depend on ffmpeg's `drawtext`.

### `color`

```jsonc
{ "type": "color", "color": "#000000", "opacity": 0.51 }
```

A solid fill, used for the translucent dim under thumbnail titles. It covers the whole canvas unless it sets a `box`.

## Box and crop

`box` is where a visual layer goes on the canvas. The source is scaled to fit inside the box while keeping its aspect ratio and is centered in it, which matches Kdenlive's `qtblend` rect with distortion off. Anything outside the canvas is clipped.

`crop` removes a fraction of the source from each edge before fitting, with each side defaulting to 0.
