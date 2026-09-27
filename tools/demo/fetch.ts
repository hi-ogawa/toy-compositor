import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const root = path.resolve(import.meta.dirname, "../..");
  const { stdout } = await execFileAsync(
    "git",
    ["worktree", "list", "--porcelain", "-z"],
    { cwd: root },
  );
  const mainWorktree = stdout.split("\0")[0].slice("worktree ".length);
  const archive = path.join(
    mainWorktree,
    "covers/2026-06-27-rescene-love-attack/media/rescene-demo.zip",
  );
  const destination = path.join(root, ".local/demo/rescene");

  // Preserve local edits and reuse media when setup is run again.
  await execFileAsync("unzip", ["-qn", archive, "-d", destination]);
  console.log(`Demo project: ${destination}/horizontal-video.json`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
