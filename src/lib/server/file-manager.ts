import { spawn } from "node:child_process";
import { once } from "node:events";

/** Open a folder in the server desktop's file manager with the platform's opener. */
export async function openInFileManager(directory: string) {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [directory], { detached: true, stdio: "ignore" });
  // Rejects when the opener is missing.
  await once(child, "spawn");
  child.unref();
}
