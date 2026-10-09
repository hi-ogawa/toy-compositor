# Pre-processing footage

Camera footage, especially from a phone, should be transcoded before it goes into a project. toy-compositor does not do this itself, so it is one ffmpeg command run by hand. Pre-processing solves four problems:

- **Frame timing goes wrong.** Phone footage has a variable frame rate, but the renderer picks frames assuming they are evenly spaced.
- **The editor may not play the file.** The editor decodes media in the browser, which may not support a phone's codec, such as HEVC.
- **Seeking in the editor lags.** Default encodes can put several seconds between keyframes, so clicking the timeline can take over half a second to show a frame.
- **Files are large.** A 3-minute 1080p phone clip can be 366MB.

```sh
ffmpeg -i input.mp4 -vf fps=30 -c:v libx264 -b:v 8000k -g 30 -preset slow -c:a aac -b:a 256k output-work-30fps-8mbps.mp4
```

| Setting        | Solves          | Effect                                                                  |
| -------------- | --------------- | ----------------------------------------------------------------------- |
| `-vf fps=30`   | Frame timing    | A constant 30 frames per second.                                        |
| `-c:v libx264` | Editor playback | H.264, which every browser decodes.                                     |
| `-g 30`        | Seeking         | A keyframe every second, so a seek decodes at most one second of video. |
| `-b:v 8000k`   | File size       | About 200MB for a 3-minute 1080p clip.                                  |

The rest of this doc explains the frame timing and seeking problems, and how to check a pre-processed file.

## Constant frame rate

A project's `media` records one frame rate per video file, and frame times are computed from it as the stream's start time plus a whole number of frame durations. The renderer seeks to the frame nearest a source time this way. With a variable frame rate, the real frames drift away from those computed times, so a render can land on a different frame than the project intends. `fps=30` rewrites the footage onto an even grid, so computed and real frame times agree.

## Keyframe interval

A keyframe is a complete picture, and the frames after it only store what changed. To show an arbitrary frame, a decoder starts from the keyframe before it and decodes forward, so the gap between keyframes sets the worst-case seek time. Without `-g`, x264 allows up to 250 frames between keyframes, which is 8.33 seconds at 30fps.

The editor seeks whenever the playhead moves while paused, so long keyframe intervals make timeline clicks lag and make any corrective seek during playback stall. To measure the trade-off, a 60-second excerpt of pre-processed phone footage was encoded with and without `-g 30` and compared with that excerpt:

|                          | Keyframes | Size   | SSIM vs source | Seek in Chromium |
| ------------------------ | --------- | ------ | -------------- | ---------------- |
| Default interval (8.33s) | 8         | 60.2MB | 0.9921         | 332 to 657ms     |
| `-g 30` (1s)             | 60        | 60.8MB | 0.9916         | 37 to 115ms      |

At a fixed bitrate, more keyframes leave slightly fewer bits for the other frames, but the SSIM difference above is far below what is visible. The seek time scales with the distance from the previous keyframe, so the default interval ranges from fast just after a keyframe to over half a second before the next.

## Check a pre-processed file

```sh
# Frame rate, which should be 30/1 for both
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,avg_frame_rate -of csv=p=0 work.mp4

# Keyframe times, which should be about one second apart
ffprobe -v error -select_streams v:0 -skip_frame nokey -show_entries frame=pts_time -of csv=p=0 work.mp4 | head
```
