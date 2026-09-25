// Usage: node render.ts <project.json> <output.(mp4|png|jpg)> [--dry-run]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { compile } from "./compile.ts";
import type { Project } from "./project.ts";

function main() {
  const [projectFile, outFile] = process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--"));
  if (!projectFile || !outFile) {
    console.error("Usage: node render.ts <project.json> <output> [--dry-run]");
    process.exit(1);
  }
  const project: Project = JSON.parse(fs.readFileSync(projectFile, "utf-8"));
  const args = compile({
    project,
    projectDir: path.dirname(path.resolve(projectFile)),
    outFile: path.resolve(outFile),
  });
  console.error(["ffmpeg", ...args.map(quote)].join(" "));
  if (process.argv.includes("--dry-run")) {
    return;
  }
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  const t0 = performance.now();
  execFileSync("ffmpeg", args, { stdio: "inherit" });
  console.error(
    `rendered ${outFile} in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
  );
}

function quote(s: string) {
  return /^[\w./:=@,+-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

main();
