import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const directory = path.resolve(
    import.meta.dirname,
    "../../samples/synthetic",
  );
  await mkdir(path.join(directory, "media"), { recursive: true });
  const ffmpeg = async (args: string[]) => {
    await execFileAsync("ffmpeg", ["-v", "error", "-y", ...args], {
      cwd: directory,
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
    "color=c=blue:s=160x90",
    "-frames:v",
    "1",
    "media/image.png",
  ]);
  console.log(`Generated media in ${directory}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
