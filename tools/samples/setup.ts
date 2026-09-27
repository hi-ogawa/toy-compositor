import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const sample = process.argv[2] ?? "synthetic";
  if (
    !sample ||
    sample === "." ||
    sample === ".." ||
    path.basename(sample) !== sample
  ) {
    throw new Error("Usage: pnpm sample:setup <sample-directory-or-zip>");
  }
  const root = path.resolve(import.meta.dirname, "../..");
  const { stdout } = await execFileAsync(
    "git",
    ["worktree", "list", "--porcelain", "-z"],
    { cwd: root },
  );
  const mainWorktree = stdout.split("\0")[0].slice("worktree ".length);
  const local = path.join(root, "samples", sample);
  const source = existsSync(local)
    ? local
    : path.join(mainWorktree, "samples", sample);
  const destination = path.join(
    root,
    ".local/samples",
    path.basename(sample, ".zip"),
  );

  await mkdir(destination, { recursive: true });

  // Preserve local edits and reuse media when setup is run again.
  if ((await stat(source)).isDirectory()) {
    await cp(source, destination, { recursive: true, force: false });
  } else {
    await execFileAsync("unzip", ["-qn", source, "-d", destination]);
  }
  console.log(`Sample project: ${destination}/project.json`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
