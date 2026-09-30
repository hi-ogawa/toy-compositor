import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Install a desktop entry that runs `command` from the desktop's app launcher,
 * with the icon copied next to it, and return the entry's path. Linux only,
 * following the XDG desktop entry spec.
 */
export async function installDesktopEntry({
  command,
  iconFile,
}: {
  command: string[];
  iconFile: string;
}): Promise<string> {
  if (process.platform !== "linux") {
    throw new Error(`No desktop entry on ${process.platform}`);
  }
  const dir = path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local/share"),
    "applications",
  );
  const entryFile = path.join(dir, "toy-compositor.desktop");
  const installedIcon = path.join(dir, "toy-compositor.svg");
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.copyFile(iconFile, installedIcon);
  // The launcher does not run the user's shell, so the command names node and
  // the CLI by absolute path rather than through PATH.
  const entry = `\
[Desktop Entry]
Type=Application
Name=Toy Compositor
Comment=Compose videos from JSON projects in the browser editor
Exec=${command.map(quoteExecArg).join(" ")}
Icon=${installedIcon}
Terminal=false
Categories=AudioVideo;Video;
`;
  await fs.promises.writeFile(entryFile, entry);
  return entryFile;
}

// The spec's Exec quoting for paths that may hold spaces: double quotes,
// escaping `"`, `` ` ``, and `$` inside them, and `%%` for `%`, which would
// start a field code.
function quoteExecArg(arg: string) {
  return `"${arg.replace(/["`$]/g, "\\$&").replaceAll("%", "%%")}"`;
}
