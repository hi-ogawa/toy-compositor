# Working media

Camera footage is transcoded into a working file before it goes into a project, with ffmpeg directly and outside toy-compositor. Both the editor and the renderer read that working file, so it has to be easy to seek as well as correct and small.

```sh
ffmpeg -i input.mp4 -vf fps=30 -c:v libx264 -b:v 8000k -g 30 -preset slow -c:a aac -b:a 256k output-work-30fps-8mbps.mp4
```

Each video setting fixes a different problem:

| Setting      | Controls          | Why                                                                                             |
| ------------ | ----------------- | ----------------------------------------------------------------------------------------------- |
| `-vf fps=30` | Frame rate        | Phone footage has a variable frame rate, and project times assume evenly spaced frames.         |
| `-b:v 8000k` | Bitrate           | Keeps a 3-minute 1080p clip around 200MB instead of the 366MB phone original.                   |
| `-g 30`      | Keyframe interval | Makes every second start with a complete frame, so seeking decodes at most one second of video. |

## Keyframe interval

A keyframe is a complete picture, and the frames after it only store what changed. To show an arbitrary frame, a decoder starts from the keyframe before it and decodes forward, so the gap between keyframes sets the worst-case seek time. Without `-g`, x264 allows up to 250 frames between keyframes, which is 8.33 seconds at 30fps.

The editor seeks whenever the playhead moves while paused, so long keyframe intervals make timeline clicks lag and make any corrective seek during playback stall. A 60-second excerpt of a phone camera clip, whose working file came from this recipe without `-g`, was encoded again with and without `-g 30`, and compared against that working file:

|                          | Keyframes | Size   | SSIM vs source | Seek in Chromium |
| ------------------------ | --------- | ------ | -------------- | ---------------- |
| Default interval (8.33s) | 8         | 60.2MB | 0.9921         | 332 to 657ms     |
| `-g 30` (1s)             | 60        | 60.8MB | 0.9916         | 37 to 115ms      |

At a fixed bitrate, more keyframes leave slightly fewer bits for the other frames, but the SSIM difference above is far below what is visible. The seek time scales with the distance from the previous keyframe, so the default interval ranges from fast just after a keyframe to over half a second before the next.

## Check a working file

```sh
# Frame rate, which should be 30/1 for both
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,avg_frame_rate -of csv=p=0 work.mp4

# Keyframe times, which should be about one second apart
ffprobe -v error -select_streams v:0 -skip_frame nokey -show_entries frame=pts_time -of csv=p=0 work.mp4 | head
```
