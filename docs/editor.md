# Editor

The editor composes the project in the DOM at one project time. Each visual layer is an absolutely positioned `<video>`, `<img>`, or div, placed in canvas pixels inside a canvas-sized div, and the whole canvas is CSS-scaled to fit the monitor. The preview shares layout math with the [compiler](compiler.md) (`placeMedia` and `getOutputRange` in [src/lib/layout.ts](../src/lib/layout.ts)), but not its rendering, so it differs from the render in the places listed [below](#differences-from-the-render).

## Components

Each component answers one question about the preview, and the preview holds no project state of its own. Inspector edits go through the runtime into `state.project`, and the composition re-renders from it, so edits show up immediately without extra wiring.

![The editor screen as nested component regions, each with the one question it answers](images/component-tree.svg)

```text
Editor                     editor.tsx               runtime store, selection, playhead
├─ CollapsibleSplit        collapsible-split.tsx    side panel width, collapsed strip
│  ├─ LibrarySourceTabs    editor.tsx               Library or Source tab
│  │  ├─ LibraryPanel      library-panel.tsx        media files and built-in layers to add
│  │  └─ MediaPreview      media-preview.tsx        the selected layer's raw file
│  └─ CompositionPreview   composition-preview.tsx  viewport scale, layers visible at time, audio
│     └─ PreviewLayer × N                           placed box to CSS, per-type rendering, outline
│        └─ CompositionMedia  composition-media.tsx transform and crop by the stored size, video
├─ Timeline                timeline.tsx             selection, seeking the playhead
│  └─ AudioWaveformView    audio-waveform.tsx       a lane's audio peaks at the timeline scale
└─ Inspector               inspector.tsx            project edits
```

The Source monitor is deliberately separate from the composition. It shows the whole file with native controls and its own `currentTime`, ignoring the layer's timing, transform, and crop, so scrubbing it never moves the composition.

## Place in Canvas Pixels, Scale Once

Layers use the project's numbers directly as CSS pixels inside a canvas div of `canvas.width × canvas.height`, which is the same space the compiler works in. The canvas div is scaled by `min(viewport width / canvas width, viewport height / canvas height)`, measured with a `ResizeObserver`. An outer div takes the scaled size, because `transform` does not change layout, so centering would otherwise use the unscaled size.

![Layers are placed in canvas pixels, the canvas is scaled once, and media is cropped by a clipping wrapper](images/coordinate-spaces.svg)

Video and image layers go through the compiler's `placeMedia`, which returns the visible cropped rectangle that `layer.transform` places. The DOM cannot crop an element directly, so a wrapper div with `overflow: hidden` is that rectangle, and the media element inside keeps its uncropped size at the same scale, shifted by the left and top crop. The source's size comes from the project's `media`, the same number the compiler scales with, so the layout is right before the media loads.

## Pick Layers and Frames by Time

The preview time decides which layers show and which frame each video shows. A layer shows when the time falls in its half-open range from `getLayerRange` in [src/lib/layout.ts](../src/lib/layout.ts), which the compiler uses too. Video and audio layers span their trimmed source from `start`, and other layers span from `start` to `end`. A visible video seeks to `in + time − start`.

![One project time picks which layers are visible and which source frame each video shows](images/time-mapping.svg)

Every layer stays mounted and is hidden outside its range, so its media is loaded before playback reaches it. Layers draw in [project order](project-format.md#layers), so later layers sit on top. Audio layers draw nothing, and their sound plays on the transport, described below.

The selected layer gets a read-only outline, drawn as a second div with the same rectangle.

## Play Along the Transport

The runtime owns playback. Audio on the `AudioContext` clock sets the time, and the playhead and video follow what is heard.

```text
EditorRuntime              runtime.ts                source loading, restarts around changes
└─ AudioContextTransport   transport.ts              playhead, play, pause, seek
   ├─ AudioBufferPlayback  audio-buffer-playback.ts  one per audio and video layer, scheduled on the clock
   └─ VideoPlayback        video-playback.ts         one per composition <video>, follows the heard position
```

![Play schedules audio at one anchor, the playhead follows the heard sound, and video closes its drift by rate](images/playback-clock.svg)

- **The heard position comes from `getOutputTimestamp`,** because Chromium on Linux reports `outputLatency` as 0.
- **Audio is scheduled, never steered.** A layer plays wherever its own range covers the playhead, so trimming decides what plays. Fades are gain ramps, and `muted` silences the layer.
- **Playbacks start only at the anchor.** An edit, or a buffer that arrives during playback, restarts the transport around the change.
- **Sources load in the background.** Loading a project decodes each source once, shared by its layers' playback and lane waveforms, so opening never waits on a long source.
- **Pausing snaps the playhead to the frame grid,** so a paused preview shows the same time as a rendered frame.

## Differences from the render

- A paused video shows whatever frame the browser picks for `currentTime`, while the render picks the nearest source frame, so the preview may be one frame off.
- Text is DOM text with `-webkit-text-stroke` and an estimated line height, while the render draws it with ImageMagick, so glyph placement differs slightly.

## Known gaps

- The transport publishes the playhead through the editor store, so the editor re-renders on every animation frame while playing.
- A video starts 50 to 90 ms behind the sound right after Play and catches up within a few seconds, because the element takes that long to start.
- Each video and audio source decodes whole into memory, about 60MB for a 3-minute stereo mix, and a video source is downloaded in full for its audio (#85).
