import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "../../utils/fs.ts";
import { validateAndMigrateProject, type SavedProject } from "../migrate.ts";
import { compile } from "./compile.ts";
import { resolveProject } from "./resolve.ts";

/** Render a project file to a video or still with ffmpeg. */
export async function renderProject({
  projectFile,
  outFile,
  dryRun,
}: {
  projectFile: string;
  outFile: string;
  dryRun?: boolean;
}) {
  const { project, changes } = await validateAndMigrateProject(
    await readJson<SavedProject>(projectFile),
  );
  if (changes.length > 0) {
    await writeJson(projectFile, project);
    console.log(`Migrated ${projectFile}`);
    for (const change of changes) {
      console.log(`  ${change}`);
    }
  }
  const projectDir = path.dirname(path.resolve(projectFile));
  const outPath = path.resolve(outFile);
  const resolved = await resolveProject({
    project,
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
  if (dryRun) {
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
