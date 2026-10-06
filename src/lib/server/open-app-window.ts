import { spawn } from "node:child_process";
import { once } from "node:events";

/**
 * The app ID Chrome gives the app window on Wayland, where it ignores
 * `--class`. Chrome derives it from the app URL's host and path and the profile
 * name, without the port, so it holds for the editor on any port.
 */
export const APP_WINDOW_WM_CLASS = "chrome-localhost__-Default";

/**
 * Opens the URL in a Chrome app window, without tabs or an address bar. A
 * profile of its own runs a separate Chrome instance, so the window gets its own
 * dock entry rather than joining the user's browser.
 */
export async function openInAppWindow(
  url: string,
  { userDataDir }: { userDataDir: string },
) {
  const child = spawn(
    "google-chrome-stable",
    [
      `--app=${url}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
    { detached: true, stdio: "ignore" },
  );
  // Rejects when Chrome is missing.
  await once(child, "spawn");
  child.unref();
}
