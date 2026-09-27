import { execFile } from "node:child_process";
import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const sample = process.argv[2];
  if (!sample) {
    throw new Error("Usage: pnpm setup-sample <directory-or-zip-path>");
  }
  const source = path.resolve(sample);
  const name = path.basename(source, path.extname(source));
  const destination = path.resolve(".local/projects", name);

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
  console.error(error);
  process.exitCode = 1;
});
