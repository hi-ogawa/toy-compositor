# Editor preview

The editor composes the project in the DOM at one project time. Each visual layer is an absolutely positioned `<video>`, `<img>`, or div, placed in canvas pixels inside a canvas-sized div, and the whole canvas is CSS-scaled to fit the monitor. The preview shares layout math with the [compiler](compiler.md) (`fitBox` and `outputRange` in [src/lib/layout.ts](../src/lib/layout.ts)), but not its rendering, so the ffmpeg render stays the truth for exact frames and text.

## Components

Each component answers one question about the preview, and the preview holds no project state of its own. Inspector edits go through the runtime into `state.project`, and the composition re-renders from it, so edits show up immediately without extra wiring.

![The editor screen as nested component regions, each with the one question it answers](images/component-tree.svg)

```text
Editor                     editor.tsx               runtime store, selection, preview time
├─ PreviewMonitors         preview-monitors.tsx     source panel open state and width only
│  ├─ MediaPreview         media-preview.tsx        the selected layer's raw file
│  └─ CompositionPreview   composition-preview.tsx  viewport scale, layers visible at time
│     └─ PreviewLayer × N                           box to CSS, per-type rendering, outline
│        └─ CompositionMedia  composition-media.tsx natural size, fit and crop, video seek
├─ layer list              editor.tsx               selection
└─ Inspector               inspector.tsx            project edits
```

The Source monitor is deliberately separate from the composition. It shows the whole file with native controls and its own `currentTime`, ignoring the layer's timing, box, and crop, so scrubbing it never moves the composition.

## Place in Canvas Pixels, Scale Once

Layers use the project's numbers directly as CSS pixels inside a canvas div of `canvas.width × canvas.height`, which is the same space the compiler works in. The canvas div is scaled by `min(viewport width / canvas width, viewport height / canvas height)`, measured with a `ResizeObserver`. An outer div takes the scaled size, because `transform` does not change layout, so centering would otherwise use the unscaled size.

![Layers are placed in canvas pixels, the canvas is scaled once, and media is cropped by a clipping wrapper](images/coordinate-spaces.svg)

Video and image layers go through the compiler's `fitBox`, which returns the visible cropped rectangle inside `layer.box`. The DOM cannot crop an element directly, so a wrapper div with `overflow: hidden` is that rectangle, and the media element inside keeps its uncropped size at the fitted scale, shifted by the left and top crop. The wrapper stays hidden until the browser reports the media's natural size.

## Pick Layers and Frames by Time

The preview time decides which layers render and which frame each video shows. A layer renders when the time falls in its half-open range from `layerRange` in [src/lib/layout.ts](../src/lib/layout.ts), which the compiler uses too. Video and audio layers span their trimmed source from `start`, and other layers span from `start` to `end`. A visible video seeks to `in + time − start`.

![One project time picks which layers are visible and which source frame each video shows](images/time-mapping.svg)

Layers draw in project order, so later layers sit on top, matching the compiler's overlay order. Audio layers are not drawn.

The selected layer gets a read-only outline, drawn as a second div with the same box. Text layers have no height, so the outline holds an invisible copy of the text to match it.

## Known gaps

- The preview time is the output start for now. The timeline's playhead replaces it next.
- A paused video shows whatever frame the browser picks for `currentTime`, while the compiler snaps to the nearest source frame, so the preview may be one frame off.
- Text is DOM text with `-webkit-text-stroke` and an estimated line height, while the compiler draws it with ImageMagick, so glyph placement differs slightly.
- Video seeks run in a React effect whenever the time changes. Playback will need media elements to follow a transport natively and to stay mounted around their range, and audio layers will need elements outside the visual tree.
- Layers are keyed by index, which holds until layers can be added or reordered.
