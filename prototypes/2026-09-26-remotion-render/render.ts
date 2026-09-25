// Usage: node render.ts <project.json> <output.(mp4|png)>
// Renders a project with Remotion. The project file is passed as input props,
// and its folder is the public dir, so media paths resolve like in the ffmpeg compiler.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Project } from "../2026-09-26-ffmpeg-compiler/project.ts";

function main() {
  const [projectFile, outFile] = process.argv.slice(2);
  if (!projectFile || !outFile) {
    console.error("Usage: node render.ts <project.json> <output>");
    process.exit(1);
  }
  const project: Project = JSON.parse(fs.readFileSync(projectFile, "utf-8"));
  const here = import.meta.dirname;
  const common = [
    path.join(here, "src/index.ts"),
    "Project",
    path.resolve(outFile),
    `--props=${path.resolve(projectFile)}`,
    `--public-dir=${path.dirname(path.resolve(projectFile))}`,
  ];
  const args =
    project.output.type === "still"
      ? ["still", ...common, "--frame=0", "--image-format=png"]
      : ["render", ...common, "--codec=h264", "--crf=20"];
  const t0 = performance.now();
  execFileSync(path.join(here, "node_modules/.bin/remotion"), args, {
    stdio: "inherit",
    cwd: here,
  });
  console.error(
    `rendered ${outFile} in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
  );
}

main();
