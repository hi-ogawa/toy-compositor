import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import type { Project } from "../project.ts";
import { compile } from "./compile.ts";
import { resolveProject } from "./resolve.ts";

async function main() {
  const [projectFile, outFile] = process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--"));
  if (!projectFile || !outFile) {
    console.error("Usage: pnpm render <project.json> <output> [--dry-run]");
    process.exit(1);
  }
  const project: Project = JSON.parse(fs.readFileSync(projectFile, "utf-8"));
  const projectDir = path.dirname(path.resolve(projectFile));
  const outPath = path.resolve(outFile);
  const resolved = await resolveProject({
    project,
    projectDir,
    textDir: path.join(path.dirname(outPath), ".text", path.basename(outPath)),
  });
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-stats",
    "-y",
    ...compile({ project, projectDir, resolved }),
    outPath,
  ];
  console.error(["ffmpeg", ...args.map(quote)].join(" "));
  if (process.argv.includes("--dry-run")) {
    return;
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const t0 = performance.now();
  const ffmpeg = spawn("ffmpeg", args, { stdio: "inherit" });
  const [code] = await once(ffmpeg, "close");
  if (code !== 0) {
    throw new Error(`ffmpeg exited with code ${code}`);
  }
  console.error(
    `rendered ${outFile} in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
  );
}

function quote(s: string) {
  return /^[\w./:=@,+-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
