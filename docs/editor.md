# Editor

The editor previews the project by composing it in the DOM at one project time. It shares the [compiler](compiler.md)'s layout and timing math, which places each clip and decides when it shows, but not its rendering, so it differs from the render in the places listed [below](#differences-from-the-render).

## Screen

The screen has four regions around one project.

![The editor screen as its regions, each with what it is for, and the runtime that every edit goes through and every region renders from](images/editor-screen.svg)

The runtime holds the project in a store, and the regions hold no project state of their own. An edit from any region goes through the runtime into the project, and every region re-renders from it, so a change in the inspector or a drag on the timeline shows up everywhere without extra wiring. Selection and gestures live in the UI, which decides placement and snapping before it calls the runtime.

The Source monitor is deliberately separate from the composition. It plays the whole file and ignores the clip's timing, transform, and crop, so scrubbing it never moves the composition.

## Place in canvas pixels, scale once

Each visual clip is an absolutely positioned element that uses the project's numbers directly as CSS pixels inside a canvas-sized div, which is the same space the compiler works in. The whole canvas is then CSS-scaled once to fit the monitor.

![Layers are placed in canvas pixels, the canvas is scaled once, and media is cropped by a clipping wrapper](images/coordinate-spaces.svg)

Video and image clips use the compiler's visible box, the cropped rectangle that `clip.transform` places. The DOM cannot crop an element directly, so a clipping wrapper is that rectangle, and the media element inside keeps its uncropped size, shifted by the left and top crop. The source's size comes from the project's `media`, the same number the compiler scales with, so the layout is right before the media loads.

## Pick clips and frames by time

The preview time decides which clips show and which frame each video shows. A clip shows when the time falls in the same picture range the compiler uses, and a visible video seeks to `in + time − start`.

![One project time picks which layers are visible and which source frame each video shows](images/time-mapping.svg)

Every clip stays mounted and is hidden outside its range or on a `hidden` layer, so its media is loaded before playback reaches it. Clips draw in [layer order](project-format.md#layers), so later layers sit on top.

Clicking the preview selects the topmost visible clip under the pointer, because the browser hit-tests the clips in that same layer order, and clicking empty space clears the selection. Dragging moves the selected clip. Like a timeline drag, it shows as a draft and commits on release, so playback reschedules once.

## Play along the transport

The transport owns the clock and the playhead. Audio plays on the `AudioContext` clock, and the playhead and video follow what is heard, so the picture never leads the sound.

![Play schedules audio at one anchor, the playhead follows the heard sound, and video closes its drift by rate](images/playback-clock.svg)

Audio is scheduled ahead on that clock and never adjusted while it plays. Play schedules every clip that covers the playhead from one anchor time, with fades as gain ramps, and a layer's `muted` leaves its clips out. An edit, or a source that finishes loading during playback, restarts the transport around the change instead of adjusting what is already scheduled. Loading a project decodes each source once in the background, shared by its clips' playback and lane waveforms, so opening never waits on a long source.

Video follows the heard position instead. Each composition `<video>` plays muted and compares its own time with where the playhead says it should be. Small drift is closed by nudging the element's playback rate over a couple of seconds, because a corrective seek lands late by however long the seek took. Only a large drift, such as after a stall, seeks.

Pausing snaps the playhead to the frame grid, and each paused video shows the source frame the render picks, so a paused preview matches a rendered frame.

## Differences from the render

- Text is DOM text with `-webkit-text-stroke` and an estimated line height, while the render draws it with ImageMagick, so glyph placement differs slightly.

## Known gaps

- The transport publishes the playhead through the editor store, so the editor re-renders on every animation frame while playing.
- A video starts 50 to 90 ms behind the sound right after Play and catches up within a few seconds, because the element takes that long to start.
- Each video and audio source decodes whole into memory, about 60MB for a 3-minute stereo mix, and a video source is downloaded in full for its audio (#85).
