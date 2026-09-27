import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
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
  const project: Project = JSON.parse(await readFile(projectFile, "utf-8"));
  const projectDir = path.dirname(path.resolve(projectFile));
  const resolved = await resolveProject({
    project,
    projectDir,
    outFile: path.resolve(outFile),
  });
  const args = compile({
    project,
    projectDir,
    resolved,
    outFile: path.resolve(outFile),
  });
  console.error(["ffmpeg", ...args.map(quote)].join(" "));
  if (process.argv.includes("--dry-run")) {
    return;
  }
  await mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
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
