import { spawn } from "node:child_process";
import { once } from "node:events";

/**
 * Open a path or URL with the desktop's default app, through the platform's
 * opener, such as a folder in the file manager or a URL in the browser.
 */
export async function openWithDefaultApp(target: string) {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [target], { detached: true, stdio: "ignore" });
  // Rejects when the opener is missing.
  await once(child, "spawn");
  child.unref();
}
