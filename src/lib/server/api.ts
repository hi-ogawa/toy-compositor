import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "../../utils/fs.ts";
import { getMediaType, type MediaFile } from "../media-file.ts";
import { probeMediaInfo } from "../media-info.ts";
import type { MediaInfo, Output, Project } from "../project.ts";
import { getDialogTool, pickProjectPath } from "./dialog.ts";
import { getParam, HttpError, serveFile, toErrorResponse } from "./http.ts";
import type { ProjectRegistry } from "./registry.ts";

/**
 * Editor API over the registered project folders. A project folder holds its
 * project files at the top level and media next to them, and only files inside
 * a registered folder are served or saved. Folders are named by absolute path
 * and files by paths relative to the folder, so a file path is never encoded
 * as a URL path.
 *
 * - `POST /api/rpc/<method>` calls one of `createEditorHandlers`' methods with
 *   the JSON body as its params, and answers with its JSON result.
 * - `GET /api/media?project=&src=` serves a layer source resolved against the
 *   project folder, as the renderer does, with range requests.
 */
export function createEditorHandler({
  registry,
}: {
  registry: ProjectRegistry;
}) {
  const handlers = createEditorHandlers({ registry });
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const method = url.pathname.match(/^\/api\/rpc\/(\w+)$/)?.[1];
      if (method) {
        return await handleRpc({ handlers, method, request });
      }
      switch (`${request.method} ${url.pathname}`) {
        case "GET /api/media":
        case "HEAD /api/media": {
          return await handleMedia({ registry, url, request });
        }
        default: {
          return new Response(undefined, { status: 404 });
        }
      }
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export type EditorHandlers = ReturnType<typeof createEditorHandlers>;

/** A project file, named by its folder's absolute path and its name in that folder. */
export type ProjectLocation = { dir: string; file: string };

export type ProjectFile = ProjectLocation & { project: Project };

/** A project file in a project folder, as `<name>.json`. */
export type ProjectEntry = {
  file: string;
  width: number;
  height: number;
  output: Output["type"];
};

/** A registered project folder with its project files, or `missing` when it no longer exists. */
export type ProjectFolder = {
  dir: string;
  missing?: boolean;
  files: ProjectEntry[];
};

/**
 * The registered project folders. `add` is absent when folders cannot be
 * added, and names the native dialog that the server can open when it has one.
 */
export type ProjectList = {
  folders: ProjectFolder[];
  add?: { dialog?: "zenity" | "osascript" };
};

async function handleRpc({
  handlers,
  method,
  request,
}: {
  handlers: EditorHandlers;
  method: string;
  request: Request;
}) {
  if (request.method !== "POST") {
    throw new HttpError({ status: 405, message: "RPC methods take POST" });
  }
  // A JSON content type makes a browser preflight a cross-origin request,
  // which this server never approves, so a page on another site cannot call
  // a method with a plain form POST.
  const contentType = request.headers.get("content-type")?.split(";")[0];
  if (contentType?.trim() !== "application/json") {
    throw new HttpError({
      status: 415,
      message: "RPC params must be application/json",
    });
  }
  if (!Object.hasOwn(handlers, method)) {
    throw new HttpError({ status: 404, message: `Unknown method ${method}` });
  }
  const result = await handlers[method as keyof EditorHandlers](
    await request.json(),
  );
  return Response.json(result ?? null);
}

/** The editor's RPC methods, each taking one params object. */
export function createEditorHandlers({
  registry,
}: {
  registry: ProjectRegistry;
}) {
  return {
    async listProjects(): Promise<ProjectList> {
      const dialog = getDialogTool();
      return {
        folders: await listProjectFolders(registry),
        add: dialog ? { dialog } : {},
      };
    },

    /** Registers a folder, or the folder of a project file inside it, by path. */
    async addProjectFolder({ path }: { path: string }): Promise<void> {
      await registry.addFolder(path);
    },

    /** Registers a folder or project file picked in the server desktop's native dialog. */
    async pickProjectFolder({
      kind,
    }: {
      kind: "folder" | "file";
    }): Promise<void> {
      const picked = await pickProjectPath({ kind });
      if (picked) {
        await registry.addFolder(picked);
      }
    },

    /** Forgets a project folder without deleting its files. */
    async removeProjectFolder({ dir }: { dir: string }): Promise<void> {
      await registry.removeFolder(dir);
    },

    async loadProject({ dir, file }: ProjectLocation): Promise<ProjectFile> {
      const projectFile = await resolveProjectFile({ registry, dir, file });
      if (!fs.existsSync(projectFile)) {
        throw new HttpError({ status: 404, message: "Project not found" });
      }
      return { dir, file, project: await readJson<Project>(projectFile) };
    },

    async saveProject({
      dir,
      file,
      project,
    }: ProjectLocation & { project: Project }): Promise<void> {
      await writeJson(
        await resolveProjectFile({ registry, dir, file }),
        project,
      );
    },

    /** Creates a project file in its folder, never overwriting an existing one. */
    async createProject({
      dir,
      file,
      project,
    }: ProjectLocation & { project: Project }): Promise<void> {
      const projectFile = await resolveProjectFile({ registry, dir, file });
      try {
        await writeJson(projectFile, project, { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new HttpError({
            status: 409,
            message: `${path.basename(projectFile)} already exists`,
          });
        }
        throw error;
      }
    },

    /** Probe a layer source into its media info, the entry that the project's `media` keeps for it. */
    async loadMediaInfo({
      src,
      dir,
    }: {
      src: string;
      dir: string;
    }): Promise<MediaInfo> {
      return await probeMediaInfo(
        await resolveMediaFile({ registry, dir, src }),
      );
    },

    /** List the media files in the project's `media/` folder. */
    async listMediaFiles({ dir }: { dir: string }): Promise<MediaFile[]> {
      const mediaDir = await resolveMediaFolder({ registry, dir });
      if (!fs.existsSync(mediaDir)) {
        return [];
      }
      const entries = await fs.promises.readdir(mediaDir, {
        withFileTypes: true,
      });
      const files: MediaFile[] = [];
      for (const entry of entries) {
        const type = getMediaType(entry.name);
        if (entry.isFile() && !entry.name.startsWith(".") && type) {
          files.push({ src: `media/${entry.name}`, type });
        }
      }
      return files.sort((a, b) => a.src.localeCompare(b.src));
    },

    /** Open the project's `media/` folder in the desktop's file manager, creating it first if needed. */
    async openMediaFolder({ dir }: { dir: string }): Promise<void> {
      const mediaDir = await resolveMediaFolder({ registry, dir });
      await fs.promises.mkdir(mediaDir, { recursive: true });
      const opener = process.platform === "darwin" ? "open" : "xdg-open";
      const child = spawn(opener, [mediaDir], {
        detached: true,
        stdio: "ignore",
      });
      // Rejects when the opener is missing.
      await once(child, "spawn");
      child.unref();
    },
  };
}

/** List each registered folder with its top-level `*.json` files that parse as projects. */
async function listProjectFolders(registry: ProjectRegistry) {
  const folders: ProjectFolder[] = [];
  for (const dir of await registry.readFolders()) {
    if (!fs.existsSync(dir)) {
      folders.push({ dir, missing: true, files: [] });
      continue;
    }
    const names = await fs.promises.readdir(dir);
    const files: ProjectEntry[] = [];
    for (const name of names) {
      if (!name.endsWith(".json") || name.startsWith(".")) {
        continue;
      }
      const project = await readProject(path.join(dir, name));
      if (project) {
        files.push({
          file: name,
          width: project.canvas.width,
          height: project.canvas.height,
          output: project.output.type,
        });
      }
    }
    files.sort((a, b) => a.file.localeCompare(b.file));
    folders.push({ dir, files });
  }
  return folders;
}

async function readProject(file: string) {
  try {
    const json = await readJson<any>(file);
    if (json.canvas && Array.isArray(json.layers)) {
      return json;
    }
  } catch {}
}

/** Serve a layer source resolved against the project folder, as the renderer does. */
async function handleMedia({
  registry,
  url,
  request,
}: {
  registry: ProjectRegistry;
  url: URL;
  request: Request;
}) {
  const file = await resolveMediaFile({
    registry,
    dir: getParam(url, "project"),
    src: getParam(url, "src"),
  });
  return await serveFile({ file, request });
}

/** Resolve `src` against the project folder, as the renderer does. */
async function resolveMediaFile({
  registry,
  dir,
  src,
}: {
  registry: ProjectRegistry;
  dir: string;
  src: string;
}) {
  const file = resolveFile({
    root: await registry.resolveFolder(dir),
    paths: [src],
  });
  if (!fs.existsSync(file)) {
    throw new HttpError({ status: 404, message: "Media not found" });
  }
  return file;
}

async function resolveMediaFolder({
  registry,
  dir,
}: {
  registry: ProjectRegistry;
  dir: string;
}) {
  return resolveFile({
    root: await registry.resolveFolder(dir),
    paths: ["media"],
  });
}

/** Resolve `file` as a `.json` file at the top level of the `dir` project folder. */
async function resolveProjectFile({
  registry,
  dir,
  file,
}: {
  registry: ProjectRegistry;
  dir: string;
  file: string;
}) {
  if (path.basename(file) !== file || path.extname(file) !== ".json") {
    throw new HttpError({
      status: 400,
      message: "Project file must be <name>.json in the project folder",
    });
  }
  return resolveFile({
    root: await registry.resolveFolder(dir),
    paths: [file],
  });
}

/**
 * Resolve `paths` against a project folder, rejecting files outside it and
 * hidden paths, such as the folder's caches.
 */
function resolveFile({
  root,
  paths,
}: {
  root: string;
  paths: string[];
}): string {
  const file = path.resolve(root, ...paths);
  if (
    !file.startsWith(root + path.sep) ||
    path
      .relative(root, file)
      .split(path.sep)
      .some((s) => s.startsWith("."))
  ) {
    throw new HttpError({
      status: 403,
      message: "Path is not served by the editor",
    });
  }
  return file;
}
