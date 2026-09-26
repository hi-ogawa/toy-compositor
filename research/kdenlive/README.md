# Findings from past Kdenlive projects

My bass-cover videos combine a camera recording of the playthrough, the mixed audio, a scrolling score, the original MV thumbnail, and a title. Each cover ships four deliverables: a horizontal video, its thumbnail, a vertical short, and its thumbnail. Everything up to the mix and the score video is already automated, and composition in Kdenlive is the last manual step. These notes record how that composition is actually done across eight past covers, so the project format in [docs/project-format.md](../../docs/project-format.md) is grounded in real usage rather than a general video editor's feature set.

The score layer is now produced by the toy-midi score video CLI ([hi-ogawa/toy-midi#683](https://github.com/hi-ogawa/toy-midi/pull/683)), which outputs a silent constant-fps H.264 MP4 at 1280x480 by default, from the first trimmed measure to the end of the last measure.

## Source data

The raw project files, render logs, and thumbnails are not committed. They come from my archive drive (`e-1800`), and `./fetch.sh` copies them into the gitignored `projects/` folder without extracting any media. [summary.py](summary.py) prints a per-layer table for each sequence (output committed as [summary.txt](summary.txt)), and [dump.py](dump.py) dumps the raw MLT structure.

- 2025 covers are zip archives `hiroshi/projects/<date>-<name>.zip` (112 archives from 2024-12 to 2025-12, 1GB to 6GB each). The four latest were checked: haechan-love-beyond (2025-09-30), riize-boom-boom-bass (2025-10-27), arrc-wow (2025-12-14), and billlie-snowy-night (2025-12-30).
- 2026 covers are unzipped folders `hiroshi/projects/2026-*` copied from the Windows machine: billlie-cloud-palace (2026-02-08), billlie-beyond-me (2026-05-30), triples-baby-flower (2026-06-21), and rescene-love-attack-john-park (2026-06-27).

Each 2025 cover archive contains roughly:

```text
<date>-<name>/
  <name>/                          Ardour session (interchange/ takes, export/session.wav)
  VID_*-30fps.mp4 or <date>.mkv    camera (phone pre-transcode or OBS)
  Screencast*-28fps.mp4            MuseScore screencast, fps-transcoded
  maxresdefault.jpg                MV thumbnail
  <name>-cover.kdenlive            horizontal project
  <name>-cover-shorts.kdenlive     vertical project
  <name>-cover{,-shorts}.mp4       renders
  thumbnail.jpg, thumbnail-shorts.jpg
```

## At a glance

One cover produces four deliverables from the same timed layers. Only layout, extra layers, and range change.

```text
Horizontal video 1920x1080          Horizontal thumbnail 1920x1080
┌──────────────────────────────┐    ┌───────────────┬──────────────┐
│                              │    │ camera        │ score        │
│        camera (full)         │    │ (shifted left)│              │
│                              │    │    ░░ TITLE over dim ░░      │
│               ┌──────────────┤    │               ├──────────────┤
│               │ score        │    │               │ MV thumbnail │
│               │              │    │               │              │
└───────────────┴──────────────┘    └───────────────┴──────────────┘

Vertical video             Vertical thumbnail
┌────────────┐             ┌────────────┐
│ score      │             │ score      │
├────────────┤             ├────────────┤
│            │             │ ░ TITLE ░  │
│ camera     │             │ over dim   │
│ (center)   │             │            │
├────────────┤             ├────────────┤
│ MV thumb   │             │ MV thumb   │
└────────────┘             └────────────┘
past: 608x1080 crop of the horizontal canvas
next: native 1080x1920
```

```text
timeline ──────────────────────────────────────────────────────────►
camera   [slap hits ···· performance ··························]  audio kept for sync, muted
mix             [········ song ·························]           the only audio that plays
score           [········ notation ·····················]
                ▲ start                                  ▲ end       horizontal video range
                             ▲ thumbnail                             horizontal still
                                    ▲ shorts-start ▲ shorts-end      vertical range, mix faded in and out
                                         ▲ shorts-thumbnail          vertical still
```

## Manual recipe (2026)

This is how the 2026 covers were made by hand, written down while making triples-baby-flower and rescene-love-attack-john-park.

- Sequences form a duplication chain. The horizontal video comes first and is the source of truth for timing. It is duplicated into the horizontal thumbnail and the vertical video, and the vertical video is duplicated into the vertical thumbnail.
- Camera sync starts with a few loud slap hits before the song. With the camera audio still on, the sharp transients are aligned against the mix waveform, one later transient is checked for drift, and then the camera audio is muted but kept as a reference.
- The vertical video stays on the 1920x1080 canvas and uses a centered 608x1080 window (x 656 to 1264). A title clip or PNG with translucent side rectangles marks the window while editing, and Kdenlive's render option `Aspect ratio: Vertical` crops to it.
- Thumbnails are rendered as a one-frame image sequence, because direct frame extraction skips the vertical render path.
- MP4 renders use `libx264 crf=23 preset=veryfast`, AAC 160k stereo, and `+faststart`.
- Kdenlive's fixed-fps transcode inflates phone footage (366MB to 900MB for a 3:09 clip), so phone footage is pre-transcoded instead:

  ```sh
  ffmpeg -i input.mp4 -vf fps=30 -c:v libx264 -b:v 8000k -preset slow -c:a aac -b:a 256k output-work-30fps-8mbps.mp4
  ```

## Two eras

The 2025 covers (Linux, Ardour) use two project files per cover and a native 1080x1920 shorts project. The 2026 covers (Windows, Ableton) use the single-project, four-sequence manual recipe above, with a 608x1080 render-time vertical crop. The 2026 section below is the current practice, and the 2025 sections are kept as background.

## 2026 covers (current practice)

The videos were inspected with `ffprobe` headers only.

Each folder contains roughly:

```text
<date>-<name>/
  <name> Project/                         Ableton project (.als, samples)
  <name>-mixed[-revN].wav or <name>.wav   mix exports, several revisions kept
  <date time>.mp4 or VID_*-30fps.mp4      camera (OBS 1920x1080 30fps, or phone pre-transcode)
  video-processed.mp4                     camera after the 8Mbps pre-transcode (rescene only)
  Screen Recording <date>.mp4             MuseScore window region capture, 30fps
  maxresdefault.jpg                       MV thumbnail, 1280x720
  <name>.kdenlive                         single project, four sequences
  <name>-full.mp4, <name>-{vertical,shorts}.mp4
  <name>-full-thumbnail*.jpg, <name>-{vertical,shorts}-thumbnail*.jpg
```

### Sequences

Every project has one horizontal 1920x1080 profile and four sequences following the duplication chain. The names vary per cover, for example `main`, `main - thumbnail`, `vertical`, `vertical - thumbnail`.

| Sequence | Layers | Render |
| --- | --- | --- |
| Horizontal video | mix, camera, score | MP4 between `start` and `end` guides |
| Horizontal thumbnail | adds MV thumbnail, dim overlay, title | one JPEG frame at the `thumbnail` guide, with a `thumbnail - end` guide one frame later as the range end |
| Vertical video | re-laid-out camera, score, MV thumbnail inside the 608x1080 center window, plus a guide layer | MP4 between `shorts - start` and `shorts - end`, with the mix trimmed to that range and faded in and out |
| Vertical thumbnail | adds dim overlay and a smaller title | one JPEG frame at `shorts - thumbnail` |

Track states confirm the sync routine. Camera audio and screencast audio stay in the timeline but are disabled (`hide=both`), and only the mix track plays. Guide layers are either a title clip with translucent green side rectangles or the `vertical-guide-608x1080.png` image, which is green outside the 608x1080 center window. The guide is disabled in most sequences, and where it stays enabled it only covers the area that the vertical crop removes.

### Layout values

All transforms are still single static `qtblend` rects.

| Layer | Horizontal video | Horizontal thumbnail | Vertical (inside x 656..1264) |
| --- | --- | --- | --- |
| Camera | full frame, sometimes shifted or zoomed 1.05x, for example `-98 -10 2016 1134`, `-113 0 1920 1080` | shifted left further to make room, for example `-247 -1 2016 1134` | box about `591..646 208..335 1056 594`, so the 608 window shows the middle of the camera frame |
| Score | bottom-right box `769..790 473..491 1152 648` | top-right box about `784 -54 1152 648` | top, box `648..656 -168..60 608..625 342..648` |
| MV thumbnail | none | bottom-right quarter `959..967 537..541 960 540` | bottom, box `655 686..740 608 349..378` |
| Dim | none | full-frame title with black background at alpha 99 to 130, named `Shade` or `Overlay` | same |
| Title | none | Noto Sans KR 160px to 210px, white with 10px black outline | the horizontal title clip scaled into the window, for example `528 297 864 486`, or a separate 90px title |

Screen recordings are now window-region captures (834x418 to 1394x652), so the score box fits a small notation-only frame instead of a scaled-down full screen. This is close to what the toy-midi score video produces.

### Timing

- Layers no longer start at 0. The mix, camera, and score sit at timeline offsets of 12s to 33s with source in-points set per layer, and `start` and `end` guides define the render range.
- Camera and score offsets differ per cover, for example billlie-beyond-me places the score at 31.907s and the camera at 33.283s with camera source in at 17.476s. Both styles, in-point and offset, are used for alignment.
- All four sequences share the same clip positions, so the duplication chain keeps timing identical and only layout, extra layers, and render range change.

### Render and media

- Preset `MP4-H264/AAC` for videos, and `JPEG` image-sequence renders of a one-frame range for thumbnails.
- Horizontal outputs are 1920x1080 at 60MB to 140MB (2.2Mbps to 5.3Mbps).
- Vertical outputs from billlie-beyond-me onward are 608x1080, so the render-time crop is not scaled up to 1080x1920. billlie-cloud-palace's shorts are 1080x1918, and its vertical thumbnails are 607 and 639 pixels wide with an `-edit` variant, which suggests the crop recipe was still being worked out in February.
- Two projects (billlie-beyond-me and triples-baby-flower) use a 23.976fps profile even though every source is 30fps, so their outputs are 23.976fps. This looks accidental, likely inherited from the first clip or a default profile, and is the kind of preview and render mismatch the new tool should avoid.
- One cover applies `lift_gamma_gain` color correction to the camera, and a couple use `frei0r.scale0tilt` crops on the score or camera.
- Camera working files range from 100MB OBS recordings at about 3.5Mbps to a 1GB phone pre-transcode at 37Mbps, and `video-processed.mp4` at 8Mbps follows the pre-transcode recipe.

## 2025 covers

These are the four latest covers from the zipped archives, and they are kept as background for the earlier workflow.

### Project shape

Each cover has two project files, each with one sequence:

- `<name>-cover.kdenlive` at 1920x1080 30fps holds the horizontal video and the horizontal thumbnail. The thumbnail is a second copy of all clips placed after a gap (at about 270s to 290s) in the same timeline, and it is exported at a `thumbnail` guide. The video render covers only the first copy.
- `<name>-cover-shorts.kdenlive` at native 1080x1920 30fps holds the vertical video and vertical thumbnail. It renders between the `shorts - start` and `shorts - end` guides (about 50s to 60s), and the thumbnail is taken at a `shorts - thumbnail` guide inside that range.

Duplication already happens at the file level, plus an in-timeline copy for the horizontal thumbnail. That matches the plan of one project file per deliverable, with thumbnails rendered as stills.

### Layers and values

All transforms are a single static `qtblend` rect with no keyframes, and there are no cuts or transitions. With `distort=0`, a rect is a box that the source is fitted into while keeping its aspect ratio, which the shorts thumbnail confirms (a landscape source in a 1080x1920 box renders as a 1080-wide band).

| Layer | Source | Horizontal | Shorts |
| --- | --- | --- | --- |
| Camera | phone `VID_*-30fps.mp4` pre-transcode or OBS `.mkv`, audio track hidden | full frame zoomed 1.05x to 1.1x, for example `-84 -103 2112 1188` | fills the middle band, box about `-34 -936 2052 3648` |
| Score | MuseScore screencast 1920x1080, pre-transcoded to 26 or 28 fps | bottom-right at 0.55x to 0.6x, for example `780 436 1152 648`, slightly overhanging the frame edges | top band at frame width, box about `0 -660 1080 1920` |
| Mix | Ardour `export/session.wav` | source in at 15s to 25s, timeline offset 0.07s to 0.4s, one cover has a 1.2s fade-out | only within the shorts range, with a 0.3s to 0.7s fade-in and 0.6s fade-out |
| MV thumbnail | `maxresdefault.jpg` | thumbnail only, bottom-right quarter `960 540 960 540`, and the score moves to top-right at about `876 -33 1056 594` | bottom band during the whole short, box about `0 668 1080 1920` |
| Title | Kdenlive title clip | thumbnail only, Noto Sans CJK HK Black 170px to 220px, white with a 10px black outline, full-frame black background at alpha 70 to 100 that dims everything below | same style at 120px to 220px, shown for the whole short or only around the thumbnail |

Per-cover summary for billlie-snowy-night (horizontal):

```text
trk2A @   0.400s  src[ 20.167..228.733]  export/session.wav               fadeout
trk3V @   0.000s  src[  7.333..216.733]  2025-12-30 22-25-45.mkv          rect=-84 -103 2112 1188
trk4V @   0.000s  src[  5.700..215.100]  스크린캐스트 ...-26fps.mp4        rect=780 436 1152 648
--- thumbnail copy ---
trk3V @ 291.266s  (same camera)                                           rect=-84 -103 2112 1188
trk4V @ 291.266s  (same score)                                            rect=876 -33 1056 594
trk6V @ 291.267s  maxresdefault.jpg                                       rect=960 540 960 540
trk7V @ 291.500s  title "Billlie snowy night"
guides: bass one 10.33s, full end 209.3s, thumbnail 425.83s
```

Timing facts:

- Camera and score clips always start at timeline 0 with the same duration, so camera sync and score alignment are both expressed as source in-points, and the mix carries a sub-second offset.
- The shorts file copies the horizontal in-points and offsets exactly, so vertical timing is inherited from horizontal.

Other effects, each seen in one cover:

- `frei0r.scale0tilt` crops 3.75% off one edge of the score or MV thumbnail in shorts, which the crop transform covers.
- arrc-wow adds a background layer behind a smaller camera. It is a still PNG of a camera frame (`arrc-wow-cover-f001670.png`) scaled 1.2x with `avfilter.gblur` sigma 20, and it can be a pre-blurred image produced outside the tool.

### Render (2025)

- Preset `MP4-H264/AAC` from Kdenlive's generic HD category, rendered by `melt-7` at roughly real time (209s of 1080p in about 236s, 50s of shorts in about 63s).
- Outputs are 74MB to 152MB for 2.5 to 3.5 minute horizontal videos and 18MB to 43MB for shorts.
- Working files are large. The phone pre-transcodes are 1.4GB to 1.8GB, and the score screencast grows from about 7MB to about 230MB after its fps transcode. This predates the 8Mbps pre-transcode recipe.
- Every render log ends with "Rendering ... aborted, resulting video will probably be corrupted" at 99% even though the output is complete and the frame counts match the guide ranges, so it looks like a Kdenlive quirk.

## Implications for the design

Across both eras:

- The layer model covers everything observed: video, image, text rendered to PNG, and audio with offsets, in/out points, and static transforms. There are no keyframes, cuts, or transitions in any of the eight covers.
- Audio layers need fade-in and fade-out durations, because every vertical video uses them.
- The transform should support fitting a source into a box while keeping its aspect ratio, because every layout relies on it.
- A title is text plus a full-frame translucent dim (alpha about 70 to 130), which fits the plan of rendering text to PNG and treating the dim as its own layer.
- All deliverables of a cover share every timing value, and only layout, extra thumbnail layers, and the render range change. So the variants can be derived by copying the horizontal video project, which matches file-level duplication of project files.
- A thumbnail is one frame of a video layout plus extra layers, which matches rendering a still at a time.

From the 2026 practice specifically:

- The vertical deliverable should be a native canvas rather than a render-time crop. The current 608x1080 output is a side effect of Kdenlive's vertical render option, and a 1080x1920 canvas avoids the upscaling that platforms apply. The existing 608-window layout values scale by 1080/608, about 1.78x, which matches the 178% camera scale used to fill the vertical frame by hand.
- The project's frame rate should be explicit and checked against the sources, because two 2026 covers rendered at 23.976fps by accident.
- Camera audio stays in the project for sync but is excluded from the mix. In the project format this became a separate audio layer rather than a mute setting, because video layers never contribute audio, and the editor can still show the camera waveform.
- Guide overlays are an editor concern, so the editor should draw the other deliverable's frame instead of the project carrying guide layers.
- Offsets are used in both styles, timeline offset and source in-point, so the schema needs both, as the draft already has.
- The toy-midi score video (1280x480, notation only) is close to the 2026 window-region screen recordings, so the 2026 score boxes are a reasonable starting template. It replaces the scaled-down full-screen captures from 2025.

## Decisions

- Output canvases follow platform standards rather than past Kdenlive outputs, because the 608x1080 vertical size and the 23.976fps projects were side effects of making Kdenlive work and were never intended. Horizontal is 1920x1080 at 30fps, and vertical is native 1080x1920 at 30fps (the YouTube Shorts and Reels standard). (2026-09-26)

## Open questions

- Remotion Studio as the editor: can Studio save props to an external per-cover JSON, and can it load media from outside `public/`?
