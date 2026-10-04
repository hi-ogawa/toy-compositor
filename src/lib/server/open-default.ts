import { spawn } from "node:child_process";
import { once } from "node:events";

export async function openWithDefaultApp(target: string) {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [target], { detached: true, stdio: "ignore" });
  // Rejects when the opener is missing.
  await once(child, "spawn");
  child.unref();
}
