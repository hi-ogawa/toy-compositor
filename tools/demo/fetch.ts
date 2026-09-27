import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const sample = process.argv[2] ?? "synthetic.zip";
  if (path.basename(sample) !== sample || path.extname(sample) !== ".zip") {
    throw new Error("Usage: pnpm demo:setup <sample.zip>");
  }
  const root = path.resolve(import.meta.dirname, "../..");
  const { stdout } = await execFileAsync(
    "git",
    ["worktree", "list", "--porcelain", "-z"],
    { cwd: root },
  );
  const mainWorktree = stdout.split("\0")[0].slice("worktree ".length);
  const local = path.join(root, "samples", sample);
  const archive = existsSync(local)
    ? local
    : path.join(mainWorktree, "samples", sample);
  const destination = path.join(
    root,
    ".local/samples",
    path.basename(sample, ".zip"),
  );

  await mkdir(destination, { recursive: true });

  // Preserve local edits and reuse media when setup is run again.
  await execFileAsync("unzip", ["-qn", archive, "-d", destination]);
  console.log(`Demo project: ${destination}/project.json`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
