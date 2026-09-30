import path from "node:path";
import { expect, test } from "@playwright/test";
import { execFileAsync } from "../src/utils/exec.ts";

test("help points to the format doc and sample in the package", async () => {
  // Print the CLI help and read the format doc and sample paths from it.
  const { stdout: help } = await execFileAsync(process.execPath, [
    "src/cli.ts",
    "--help",
  ]);
  expect(help).toContain("Getting started:");
  const formatDoc = help.match(/^Format doc: (.*)$/m)?.[1];
  const sample = help.match(/^Sample: +(.*)$/m)?.[1];
  expect(formatDoc).toBe(path.resolve("docs/project-format.md"));
  expect(sample).toBe(path.resolve("samples/synthetic"));

  // List the files the package would publish and confirm it ships both.
  const { stdout: pack } = await execFileAsync("npm", [
    "pack",
    "--dry-run",
    "--json",
    "--ignore-scripts",
  ]);
  const files = (JSON.parse(pack)[0].files as { path: string }[]).map(
    (file) => file.path,
  );
  expect(files).toEqual(
    expect.arrayContaining([
      "docs/project-format.md",
      "docs/images/source-timing.svg",
      "samples/synthetic/project.json",
      "samples/synthetic/thumbnail.json",
      "samples/synthetic/media/video.mp4",
      "samples/synthetic/media/audio.wav",
      "samples/synthetic/media/image.png",
    ]),
  );
});
