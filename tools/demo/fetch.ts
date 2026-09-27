import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const worktrees = execFileSync(
  "git",
  ["worktree", "list", "--porcelain", "-z"],
  {
    cwd: root,
    encoding: "utf-8",
  },
);
const main = worktrees.split("\0")[0].slice("worktree ".length);
const archive = path.join(
  main,
  "covers/2026-06-27-rescene-love-attack/media/rescene-demo.zip",
);
const destination = path.join(root, ".local/demo/rescene");

// Preserve local edits and reuse media when setup is run again.
execFileSync("unzip", ["-qn", archive, "-d", destination], {
  stdio: "inherit",
});
console.log(`Demo project: ${destination}/horizontal-video.json`);
