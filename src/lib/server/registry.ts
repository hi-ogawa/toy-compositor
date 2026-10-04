import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJson } from "../../utils/fs.ts";
import { HttpError } from "./http.ts";

export type ProjectRegistry = ReturnType<typeof createProjectRegistry>;

/**
 * The project folders that the user opened. The file is read on every call, so
 * a folder that `toy-compositor add` registers shows up in a running server.
 */
export function createProjectRegistry({ configDir }: { configDir: string }) {
  const file = path.join(configDir, "projects.json");

  async function readFolders(): Promise<string[]> {
    if (!fs.existsSync(file)) {
      return [];
    }
    return (await readJson<{ folders: string[] }>(file)).folders;
  }

  // Each change reads the list and writes it back. Doing both synchronously
  // keeps other requests from running in between and dropping each other's
  // edits, and the file is small enough that blocking briefly is fine.
  function updateFolders(update: (folders: string[]) => string[]) {
    const folders: string[] = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf-8")).folders
      : [];
    fs.mkdirSync(configDir, { recursive: true });
    // Writing in place truncates the file first, so a concurrent
    // `readFolders` could parse half of it. Renaming a finished temp file over
    // it means readers see either the old list or the new one.
    const tempFile = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(
      tempFile,
      JSON.stringify({ folders: update(folders) }, null, 2) + "\n",
    );
    fs.renameSync(tempFile, file);
  }

  return {
    readFolders,

    /** Registering a folder again keeps its place in the list. */
    async addFolder(target: string): Promise<string> {
      const resolved = path.resolve(target);
      const stat = fs.existsSync(resolved)
        ? await fs.promises.stat(resolved)
        : undefined;
      let directory: string;
      if (stat?.isDirectory()) {
        directory = resolved;
      } else if (stat?.isFile() && path.extname(resolved) === ".json") {
        directory = path.dirname(resolved);
      } else {
        throw new HttpError({
          status: 400,
          message: `${target} is not a folder or a project file`,
        });
      }
      updateFolders((folders) =>
        folders.includes(directory) ? folders : [...folders, directory],
      );
      return directory;
    },

    /** Forget a folder without touching its files. */
    async removeFolder(directory: string) {
      updateFolders((folders) =>
        folders.filter((folder) => folder !== directory),
      );
    },

    async resolveFolder(directory: string): Promise<string> {
      if (!(await readFolders()).includes(directory)) {
        throw new HttpError({
          status: 403,
          message: `${directory} is not a registered project folder`,
        });
      }
      return directory;
    },
  };
}

/**
 * `TOY_COMPOSITOR_CONFIG_DIR` overrides the platform's config directory, so
 * development and tests keep their own registry.
 */
export function getConfigDir(): string {
  if (process.env.TOY_COMPOSITOR_CONFIG_DIR) {
    return path.resolve(process.env.TOY_COMPOSITOR_CONFIG_DIR);
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "toy-compositor",
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    "toy-compositor",
  );
}
