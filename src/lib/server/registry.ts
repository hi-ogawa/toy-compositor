import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJson, writeJson } from "../../utils/fs.ts";
import { HttpError } from "./http.ts";

/**
 * The project folders that the user opened, by absolute path, kept in
 * `projects.json` under the config directory. It is read on every call, so a
 * folder that `toy-compositor add` registers shows up in a running server.
 */
export function createProjectRegistry({ configDir }: { configDir: string }) {
  const file = path.join(configDir, "projects.json");

  async function readFolders(): Promise<string[]> {
    if (!fs.existsSync(file)) {
      return [];
    }
    return (await readJson<{ folders: string[] }>(file)).folders;
  }

  async function writeFolders(folders: string[]) {
    await fs.promises.mkdir(configDir, { recursive: true });
    await writeJson(file, { folders });
  }

  return {
    readFolders,

    /**
     * Register a folder, or the folder of a project file inside it, and return
     * the folder. Registering a folder again keeps its place in the list.
     */
    async addFolder(target: string): Promise<string> {
      const resolved = path.resolve(target);
      const stat = await fs.promises.stat(resolved).catch(() => undefined);
      let dir: string;
      if (stat?.isDirectory()) {
        dir = resolved;
      } else if (stat?.isFile() && path.extname(resolved) === ".json") {
        dir = path.dirname(resolved);
      } else {
        throw new HttpError({
          status: 400,
          message: `${target} is not a folder or a project file`,
        });
      }
      const folders = await readFolders();
      if (!folders.includes(dir)) {
        await writeFolders([...folders, dir]);
      }
      return dir;
    },

    /** Forget a folder without touching its files. */
    async removeFolder(dir: string) {
      const folders = await readFolders();
      await writeFolders(folders.filter((folder) => folder !== dir));
    },

    /** Return `dir` when it is registered, or throw a 403 error. */
    async resolveFolder(dir: string): Promise<string> {
      if (!(await readFolders()).includes(dir)) {
        throw new HttpError({
          status: 403,
          message: `${dir} is not a registered project folder`,
        });
      }
      return dir;
    },
  };
}

export type ProjectRegistry = ReturnType<typeof createProjectRegistry>;

/**
 * The user's config directory for toy-compositor, following the platform's
 * conventions. `TOY_COMPOSITOR_CONFIG_DIR` overrides it, so development and
 * tests keep their own registry.
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
