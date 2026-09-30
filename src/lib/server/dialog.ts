import fs from "node:fs";
import path from "node:path";
import { execFileAsync } from "../../utils/exec.ts";

/**
 * The platform's native picker that the server can open on its desktop:
 * zenity on Linux, which picks either folders or files, and `osascript` on
 * macOS, whose panel picks both.
 */
export type DialogTool = "zenity" | "osascript";

export function getDialogTool(): DialogTool | undefined {
  switch (process.platform) {
    case "linux": {
      // zenity is often not installed, so look for it on PATH.
      const dirs = (process.env.PATH ?? "").split(path.delimiter);
      return dirs.some((dir) => fs.existsSync(path.join(dir, "zenity")))
        ? "zenity"
        : undefined;
    }
    case "darwin": {
      return "osascript";
    }
  }
}

/**
 * Open the native picker for a project folder, or with `kind: "file"` for a
 * project file, and return the picked path, or `undefined` when cancelled.
 */
export async function pickProjectPath({
  kind,
}: {
  kind: "folder" | "file";
}): Promise<string | undefined> {
  const tool = getDialogTool();
  if (!tool) {
    throw new Error(`No native dialog on ${process.platform}`);
  }
  const [command, args] =
    tool === "zenity"
      ? [
          "zenity",
          kind === "folder"
            ? ["--file-selection", "--directory", "--title=Add project folder"]
            : [
                "--file-selection",
                "--title=Add project file",
                "--file-filter=Project files | *.json",
              ],
        ]
      : ["osascript", ["-l", "JavaScript", "-e", MAC_PICKER_SCRIPT]];
  try {
    const { stdout } = await execFileAsync(command, args);
    return stdout.trim() || undefined;
  } catch (error) {
    // zenity exits with 1 when the dialog is cancelled.
    if ((error as { code?: unknown }).code === 1) {
      return undefined;
    }
    throw error;
  }
}

// An open panel that accepts a folder or a file, printing the POSIX path or
// nothing when cancelled.
const MAC_PICKER_SCRIPT = `\
ObjC.import("AppKit");
$.NSApplication.sharedApplication.activateIgnoringOtherApps(true);
const panel = $.NSOpenPanel.openPanel;
panel.canChooseFiles = true;
panel.canChooseDirectories = true;
panel.allowsMultipleSelection = false;
panel.title = "Add project folder";
panel.runModal == $.NSModalResponseOK ? panel.URLs.objectAtIndex(0).path.js : "";
`;
