import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileAsync } from "../../utils/exec.ts";
import { DBusConnection } from "./dbus.ts";

/**
 * The platform's native picker that the server can open on its desktop: the
 * XDG desktop portal on Linux, or zenity where no portal runs, which pick
 * either folders or files, and `osascript` on macOS, whose panel picks both.
 */
export type DialogTool = "portal" | "zenity" | "osascript";

export async function getDialogTool(): Promise<DialogTool | undefined> {
  // e2e cannot operate a native dialog, so it runs the server without one.
  if (process.env.TOY_COMPOSITOR_NO_FOLDER_DIALOG) {
    return;
  }
  switch (process.platform) {
    case "linux": {
      if (await checkPortal()) {
        return "portal";
      }
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
  const tool = await getDialogTool();
  if (!tool) {
    throw new Error(`No native dialog on ${process.platform}`);
  }
  if (tool === "portal") {
    return pickWithPortal({ kind });
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

const PORTAL = {
  destination: "org.freedesktop.portal.Desktop",
  path: "/org/freedesktop/portal/desktop",
};

// The portal stays available while the server runs, so probe it once. Getting
// the FileChooser version also starts a D-Bus activated portal.
let portalCheck: Promise<boolean> | undefined;

function checkPortal(): Promise<boolean> {
  portalCheck ??= (async () => {
    const bus = await DBusConnection.connectSession();
    try {
      await bus.call({
        ...PORTAL,
        interface: "org.freedesktop.DBus.Properties",
        member: "Get",
        signature: "ss",
        body: ["org.freedesktop.portal.FileChooser", "version"],
      });
      return true;
    } finally {
      bus.close();
    }
  })().catch(() => false);
  return portalCheck;
}

/**
 * Open the portal's FileChooser, which answers on a Request object with a
 * Response signal. The portal closes the dialog when its caller leaves the
 * bus, so the connection stays open until the response.
 * https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.FileChooser.html
 */
async function pickWithPortal({
  kind,
}: {
  kind: "folder" | "file";
}): Promise<string | undefined> {
  const bus = await DBusConnection.connectSession();
  try {
    // The request path is derived from the caller and token, so the Response
    // can be awaited before the call returns it.
    const token = `toy_compositor_${randomUUID().replaceAll("-", "")}`;
    const sender = bus.uniqueName.slice(1).replaceAll(".", "_");
    const response = bus.waitForSignal({
      path: `${PORTAL.path}/request/${sender}/${token}`,
      interface: "org.freedesktop.portal.Request",
      member: "Response",
    });
    const options =
      kind === "folder"
        ? { directory: { signature: "b", value: true } }
        : {
            filters: {
              signature: "a(sa(us))",
              value: [["Project files", [[0, "*.json"]]]],
            },
          };
    const [responseBody] = await Promise.all([
      response,
      bus.call({
        ...PORTAL,
        interface: "org.freedesktop.portal.FileChooser",
        member: "OpenFile",
        signature: "ssa{sv}",
        body: [
          "",
          kind === "folder" ? "Add project folder" : "Add project file",
          { handle_token: { signature: "s", value: token }, ...options },
        ],
      }),
    ]);
    const [code, results] = responseBody as [number, { uris?: string[] }];
    switch (code) {
      case 0: {
        return fileURLToPath(results.uris![0]);
      }
      case 1: {
        // Cancelled by the user.
        return;
      }
      default: {
        throw new Error("The file chooser portal failed");
      }
    }
  } finally {
    bus.close();
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
