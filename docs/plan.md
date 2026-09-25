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
- The human uses a minimal editor for timeline alignment and composition tweaks, which means layer offsets such as camera sync, range edges, and position and scale on a still preview. The editor reads and writes the same project file and does nothing else.

## Composition model

The tool is boring, generic composition with no bass-cover logic, simple enough that agents can derive one project from another and scripts can generate projects directly. The format itself is drafted in [project-format.md](project-format.md).

- A project is one composition with a canvas size, a frame rate, an output, and a stack of layers.
- Layers are video, audio, image, text, or a solid color. Timed layers have a timeline offset and source in/out points. Visual layers have a box that the source fits into while keeping its aspect ratio, plus an optional crop. Video layers can also hold their first and last frames beyond the source range.
- Video layers carry no audio. Camera audio that is only needed for sync is a separate audio layer on the same file, so it can stay available in the editor without reaching the mix.
- Rendering produces either a video over a time range or a still image at a time. The tool does not distinguish thumbnails from videos.
- Deliverable variants are separate project files derived by copying and editing, so duplication happens at the file level where agents and scripts can do it.
- Canvases follow platform standards rather than past Kdenlive outputs, so horizontal is 1920x1080 at 30fps and vertical is native 1080x1920 at 30fps.
- Bass-cover specifics, including which deliverables exist, the horizontal and vertical layouts, and the MV thumbnail and title layers, live in templates and agent recipes outside the tool.

## Implementation

The tool is built on ffmpeg rather than Remotion. Remotion's projects are React code rather than declarative data, so it would need a JSON-to-React interpreter in front of it, and its offline render captures every frame from headless Chrome, which buys nothing for static layouts of existing media. A native ffmpeg filter graph composes the same result directly and gives direct control over encoding and file size.

It has four parts:

1. **Format.** A typed JSON project file that agents, scripts, and the editor all read and write.
2. **Compiler.** A function from a project to ffmpeg arguments. It starts from a solid canvas at the project size and rate, seeks and trims each video layer to its visible range, shifts it to its offset, normalizes the frame rate, crops and scales it, and overlays it in layer order. Audio layers are trimmed, faded, delayed, and mixed. A still uses the same graph for a single frame. Text is rendered to a PNG first rather than styled through `drawtext` and system fonts.
3. **Editor.** A small browser app backed by a local server that runs the compiler. The preview image is an ffmpeg-rendered still of the current project, so preview and final render match by construction, and the browser only draws layer bounds and drag handles computed from the same fit math. Waveforms come from peaks precomputed with ffmpeg, and cross-correlation can later suggest a starting offset.
4. **Playback preview.** Real-time preview uses native `<video>` and `<audio>` elements as followers of an app-owned transport clock based on `AudioContext.currentTime`, which keeps running even when a project has no audio. An rAF loop reads the transport time to draw the playhead and overlays, and each media element is drift-corrected against it, following the same pattern as the toy-midi recorder transport.

### Truth boundaries

- The project file's numbers are the timing truth. Offsets are set on waveforms, which are exact data, and playback only confirms them, so preview drift never shifts the final render. This avoids the Kdenlive problem where preview and render disagreed and timeline positions had to be compensated by guesswork.
- Source time is a presentation timestamp, including a stream's start offset, and the frame shown at a source time is the frame whose timestamp is nearest to it. Every renderer and the editor preview must pick frames this way, because project times are rounded to milliseconds and source frames often sit off the project's frame grid, so a looser rule makes renderers disagree by one frame.
- ffmpeg-rendered stills are the layout truth. Element-based playback may place layers slightly differently with CSS, which is acceptable because it only serves timing confirmation.
- The browser never needs to decode source footage for layout or waveforms, so browser codec support such as HEVC only affects playback preview, and constant frame rate working files from ingest cover that case.

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
- [ ] Editor still preview at a chosen time
- [ ] Editor drag and scale of visual layers
- [ ] Editor offset nudging against waveforms and playback preview
- [ ] Editor range edge adjustment
- [ ] Editor real-time playback preview with drift correction

Deferred beyond the MVP are automatic offset suggestion by cross-correlation and everything under non-goals.

## Next

- [x] Check the draft against past `.kdenlive` projects ([research/kdenlive](../research/kdenlive/README.md)).
- [x] Prove the ffmpeg render path on one real cover ([prototype results](../prototypes/2026-09-26-ffmpeg-compiler/README.md)).
- [ ] Try Remotion Studio as the editor, to avoid building an editor app. Scaffold one generic layers composition that renders a project file, then edit the rescene cover in Studio. Check whether Studio can save edits back to the per-cover project JSON rather than only to inline `defaultProps` in source, whether it can load media from outside `public/`, whether numeric props-panel editing is acceptable for transform tweaks compared with dragging, and whether its timeline shows enough, such as waveforms, to align the camera offset. Final renders stay on the ffmpeg compiler either way. If the experiment succeeds, the editor app drops out of the MVP.

## Non-goals

- Cuts, transitions, keyframes, effects, or general multi-clip editing.
- Rendering the score, which belongs to toy-midi.
