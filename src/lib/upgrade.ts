import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { execFileAsync } from "../utils/exec.ts";
import { getDesktopEntryFile } from "./desktop-entry.ts";

export const UPGRADE_SOURCE = "https://pkg.pr.new/hi-ogawa/toy-compositor@main";

/**
 * Install the package from `source` globally with pnpm, and rewrite the
 * desktop entry if one is installed. The entry names the package's CLI by its
 * versioned path, so the newly installed CLI writes it again.
 */
export async function upgradeGlobalInstall(source: string) {
  await runCommand("pnpm", ["add", "-g", source]);
  if (fs.existsSync(getDesktopEntryFile())) {
    const { stdout } = await execFileAsync("pnpm", ["bin", "-g"]);
    const cli = path.join(stdout.trim(), "toy-compositor");
    await runCommand(cli, ["install-desktop"]);
  }
}

async function runCommand(command: string, args: string[]) {
  const child = spawn(command, args, { stdio: "inherit" });
  const [code] = await once(child, "close");
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${code}`);
  }
}
