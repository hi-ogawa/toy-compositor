import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileAsync } from "../utils/exec.ts";
import { installDesktopEntry } from "./desktop-entry.ts";

/**
 * Install the build from `source` into the app's own data folder, and point
 * the `toy-compositor` command and the app launcher entry at it.
 *
 * Each build is unpacked into `builds/<id>/`, and the `current` link switches
 * to it in one rename, so a failed download leaves the previous build in use.
 * The command and the launcher entry name `current`, so they stay valid across
 * upgrades. They name node by absolute path, because the launcher does not
 * load the user's shell PATH, and each upgrade writes them again in case node
 * moved.
 */
export async function upgradeInstall(source: string) {
  const url = source.includes("://")
    ? source
    : `https://pkg.pr.new/hi-ogawa/toy-compositor@${source}`;
  const dataDir = path.join(getDataHome(), "toy-compositor");
  const buildsDir = path.join(dataDir, "builds");
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const buildDir = path.join(buildsDir, id);
  await fs.promises.mkdir(buildDir, { recursive: true });

  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url} (${res.status})`);
  }
  const tarball = `${buildDir}.tgz`;
  await fs.promises.writeFile(tarball, Buffer.from(await res.arrayBuffer()));
  // npm tarballs hold the package under `package/`.
  await execFileAsync("tar", [
    "-xzf",
    tarball,
    "-C",
    buildDir,
    "--strip-components=1",
  ]);
  await fs.promises.rm(tarball);

  const currentLink = path.join(dataDir, "current");
  const previous = await fs.promises.readlink(currentLink).catch(() => {});
  const tempLink = `${currentLink}.tmp`;
  await fs.promises.rm(tempLink, { force: true });
  await fs.promises.symlink(path.join("builds", id), tempLink);
  await fs.promises.rename(tempLink, currentLink);
  // Keep the previous build to roll back to by hand.
  for (const name of await fs.promises.readdir(buildsDir)) {
    if (name !== id && path.join("builds", name) !== previous) {
      await fs.promises.rm(path.join(buildsDir, name), {
        recursive: true,
        force: true,
      });
    }
  }
  console.log(`Installed ${path.join(buildsDir, id)}`);

  const commandFile = path.join(os.homedir(), ".local/bin/toy-compositor");
  await fs.promises.mkdir(path.dirname(commandFile), { recursive: true });
  const cli = path.join(currentLink, "dist/server/cli.js");
  await fs.promises.writeFile(
    commandFile,
    `#!/bin/sh\nexec ${quoteShellArg(process.execPath)} ${quoteShellArg(cli)} "$@"\n`,
  );
  await fs.promises.chmod(commandFile, 0o755);
  console.log(`Installed ${commandFile}`);

  const entryFile = await installDesktopEntry({
    command: [commandFile, "serve", "--open"],
    iconFile: path.join(currentLink, "dist/client/icon.svg"),
  });
  console.log(`Installed ${entryFile}`);
}

function getDataHome() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local/share");
}

function quoteShellArg(arg: string) {
  return `'${arg.replaceAll("'", `'\\''`)}'`;
}
