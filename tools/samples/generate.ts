import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Project } from "../../src/lib/project.ts";

const execFileAsync = promisify(execFile);

async function main() {
  const root = path.resolve(import.meta.dirname, "../..");
  await mkdir(path.join(root, ".local"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".local/synthetic-"));
  try {
    await mkdir(path.join(temporary, "media"));
    const ffmpeg = async (args: string[]) => {
      await execFileAsync("ffmpeg", ["-v", "error", "-y", ...args], {
        cwd: temporary,
      });
    };
    await ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=16000",
      "-t",
      "3",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "32k",
      "-movflags",
      "+faststart",
      "media/video.mp4",
    ]);
    await ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:sample_rate=16000",
      "-t",
      "3",
      "media/audio.wav",
    ]);
    await ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:size=160x90",
      "-frames:v",
      "1",
      "-threads",
      "1",
      "media/image.png",
    ]);
    const project: Project = {
      canvas: { width: 640, height: 360, fps: 30, background: "#000000" },
      output: { type: "video", start: 0, end: 3 },
      layers: [
        {
          name: "video",
          type: "video",
          src: "media/video.mp4",
          start: 0,
          in: 0,
          out: 3,
          box: { x: 0, y: 0, width: 640, height: 360 },
          muted: true,
        },
        {
          name: "audio",
          type: "audio",
          src: "media/audio.wav",
          start: 0,
          in: 0,
          out: 3,
          fadeIn: 0.2,
          fadeOut: 0.5,
        },
        {
          name: "image",
          type: "image",
          src: "media/image.png",
          box: { x: 420, y: 240, width: 160, height: 90 },
        },
      ],
    };
    await writeFile(
      path.join(temporary, "project.json"),
      JSON.stringify(project, null, 2) + "\n",
    );
    await execFileAsync(
      "zip",
      [
        "-q",
        "-X",
        "-1",
        "sample.zip",
        "project.json",
        "media/video.mp4",
        "media/audio.wav",
        "media/image.png",
      ],
      { cwd: temporary },
    );
    await mkdir(path.join(root, "samples"), { recursive: true });
    const archive = path.join(root, "samples/synthetic.zip");
    await rename(path.join(temporary, "sample.zip"), archive);
    console.log(`Generated ${archive}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
