# Plan

This is the working plan for toy-compositor. It is expected to change as prototypes answer open questions.

## Direction

Replace the remaining manual Kdenlive step in my bass-cover video workflow with a focused composition tool built around how covers are actually made ([research/kdenlive](../research/kdenlive/README.md)), rather than a general video editor.

The tool only composes finished media. The mix is the timing reference, and every other layer, including the camera and the score, arrives as a finished clip whose offset the human aligns in the editor, for example the camera against the mix waveform and the score against playback preview. How a clip was produced does not matter to the tool.

In the full production, the mix comes from the [toy-midi](https://github.com/hi-ogawa/toy-midi) recorder's stereo export, and the score video comes from toy-midi's score video CLI ([toy-midi#683](https://github.com/hi-ogawa/toy-midi/pull/683), with stable framing tracked in [toy-midi#692](https://github.com/hi-ogawa/toy-midi/issues/692)), though a screen recording works the same way.

## Product shape

Agents drive the work from a basic template to the final render, and the human only does the bare-minimum editing that needs an eye.

- A readable, declarative project file is the source of truth. Agents and the human edit the same file.
- Agents work through a CLI to create a project from a template and inputs, lay out the composition, render stills to verify it visually, and produce the final renders.
- The human uses a minimal editor for timeline alignment and composition tweaks, which means layer offsets such as camera sync, range edges, locators, and position and scale on a preview. The editor reads and writes the same project file and does nothing else.

## Composition model

The tool is boring, generic composition with no bass-cover logic, simple enough that agents can derive one project from another and scripts can generate projects directly. The format itself is drafted in [project-format.md](project-format.md).

- A project is one composition with a canvas size, a frame rate, an output, and a stack of layers.
- Layers are video, audio, image, text, or a solid color. Timed layers have a timeline offset and source in/out points. Visual layers have a box that the source fits into while keeping its aspect ratio, plus an optional crop. Video layers can also hold their first and last frames beyond the source range.
- Video layers carry their audio, and `muted` leaves a layer's audio out of the mix. The camera is a muted video layer, so its audio stays available in the editor for sync without reaching the mix.
- Layers can have names, and projects can have labeled locators, so scripts can find the camera layer or the thumbnail time in an edited project.
- Rendering produces either a video over a time range or a still image at a time. The tool does not distinguish thumbnails from videos.
- Deliverable variants are separate project files derived by copying and editing, so duplication happens at the file level where agents and scripts can do it.
- Canvases follow platform standards rather than past Kdenlive outputs, so horizontal is 1920x1080 at 30fps and vertical is native 1080x1920 at 30fps.
- Bass-cover specifics, including which deliverables exist, the horizontal and vertical layouts, and the MV thumbnail and title layers, live in templates and agent recipes outside the tool.

## Implementation

The tool is built on ffmpeg rather than Remotion. Remotion's projects are React code rather than declarative data, so it would need a JSON-to-React interpreter in front of it, and its offline render captures every frame from headless Chrome, which buys nothing for static layouts of existing media. A native ffmpeg filter graph composes the same result directly and gives direct control over encoding and file size.

It has four parts:

1. **Format.** A typed JSON project file that agents, scripts, and the editor all read and write.
2. **Compiler.** A function from a project to ffmpeg arguments. It starts from a solid canvas at the project size and rate, seeks and trims each video layer to its visible range, shifts it to its offset, normalizes the frame rate, crops and scales it, and overlays it in layer order. Audio layers and unmuted video layers' audio are trimmed, faded, delayed, and mixed. A still uses the same graph for a single frame. Text is rendered to a PNG first rather than styled through `drawtext` and system fonts.
3. **Editor.** A small browser app shaped after the toy-midi recorder ([#3](https://github.com/hi-ogawa/toy-compositor/issues/3)), backed by Vite middleware that loads and saves one project file and serves its media. The preview is composed in the DOM, with each visual layer as a positioned `<video>`, `<img>`, or div placed with the compiler's fit math. The browser decodes each source's audio for waveforms, and cross-correlation can later suggest a starting offset.
4. **Playback preview.** Real-time preview uses native `<video>` and `<audio>` elements as followers of an app-owned transport clock based on `AudioContext.currentTime`, which keeps running even when a project has no audio. An rAF loop reads the transport time to draw the playhead and overlays, and each media element is drift-corrected against it, following the same pattern as the toy-midi recorder transport.

### Truth boundaries

- The project file's numbers are the timing truth. Offsets are set on waveforms, which are exact data, and playback only confirms them, so preview drift never shifts the final render. This avoids the Kdenlive problem where preview and render disagreed and timeline positions had to be compensated by guesswork.
- Source time is a presentation timestamp, including a stream's start offset, and the frame shown at a source time is the frame whose timestamp is nearest to it. Every renderer and the editor preview must pick frames this way, because project times are rounded to milliseconds and source frames often sit off the project's frame grid, so a looser rule makes renderers disagree by one frame.
- The ffmpeg render is the truth for exact frames. The DOM preview draws the same layout within 1px ([research/remotion](../research/remotion/README.md)), which is enough for placing layers, but a paused seek may land one frame off the nearest-frame rule, so frame choices such as the thumbnail are checked on a render.
- The editor plays and decodes source media in the browser, so browser codec support such as HEVC matters there, and constant frame rate working files from ingest cover that case.

### Media

- Variable frame rate phone footage is normalized to constant frame rate working files at ingest, which matches the existing manual pre-transcode.
- Encoding settings are explicit in the compiler output, which avoids Kdenlive's file-size inflation.

## MVP

The MVP is done when one new cover's deliverables are produced without opening Kdenlive. The rescene cover in [covers/](../covers/) does not count, because its values were transcribed from a finished Kdenlive project.

- [ ] Project format covering everything in the composition model ([draft](project-format.md))
- [x] CLI render of a video over a time range ([prototype](../prototypes/2026-09-26-ffmpeg-compiler/))
- [x] CLI render of a still image at a time ([prototype](../prototypes/2026-09-26-ffmpeg-compiler/))
- [ ] First and last frame hold for video layers, compiled with `tpad` clone
- [ ] Editor that loads and saves a project file
- [ ] Editor preview at the playhead
- [ ] Editor box and crop adjustment of visual layers
- [ ] Editor offset nudging against waveforms and playback preview
- [ ] Editor range edge adjustment
- [ ] Editor real-time playback preview with drift correction

Deferred beyond the MVP are automatic offset suggestion by cross-correlation and everything under non-goals.

## Next

- [x] Check the draft against past `.kdenlive` projects ([research/kdenlive](../research/kdenlive/README.md)).
- [x] Prove the ffmpeg render path on one real cover ([prototype results](../prototypes/2026-09-26-ffmpeg-compiler/README.md)).
- [x] Try Remotion Studio as the editor. Remotion reproduces the ffmpeg layout within 1px ([research/remotion](../research/remotion/README.md)), but Studio treats code as the source of truth and every step fought a JSON project file ([#2](https://github.com/hi-ogawa/toy-compositor/pull/2)), so the tool gets its own small editor instead.
- [ ] Build a minimal project editor ([#3](https://github.com/hi-ogawa/toy-compositor/issues/3)).

## Non-goals

- Cuts, transitions, keyframes, effects, or general multi-clip editing.
- Rendering the score, which belongs to toy-midi.
