import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "../../utils/fs.ts";
import { getMediaType, type MediaFile } from "../media-file.ts";
import { probeMediaInfo } from "../media-info.ts";
import type { MediaInfo, Output, Project } from "../project.ts";
import { getDialogTool, pickProjectPath } from "./dialog.ts";
import { getParam, HttpError, serveFile, toErrorResponse } from "./http.ts";
import type { LiveConnections } from "./live.ts";
import { openWithDefaultApp } from "./open-default.ts";
import type { ProjectRegistry } from "./registry.ts";

/**
 *
 * - `POST /api/rpc/<method>` calls one of `createEditorHandlers`' methods with
 *   the JSON body as its params, and answers with its JSON result.
 * - `GET /api/media?project=&src=` serves a layer source resolved against the
 *   project folder, as the renderer does, with range requests.
 * - `GET /api/live` holds an event stream open for as long as the tab that
 *   requested it is open.
 * - `GET /api/server` answers `{ "name": "toy-compositor" }`, so the CLI can
 *   tell an editor server apart from another process on its port.
 */
export function createEditorHandler({
  registry,
  live,
}: {
  registry: ProjectRegistry;
  live: LiveConnections;
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
        case "GET /api/live": {
          return live.handleRequest();
        }
        case "GET /api/server": {
          return Response.json({ name: SERVER_NAME });
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

export const SERVER_NAME = "toy-compositor";

export type EditorHandlers = ReturnType<typeof createEditorHandlers>;

/** A project file and its content, named by the file's absolute path. */
export type ProjectFile = { file: string; project: Project };

/** A project file at the top level of a project folder, by absolute path. */
export type ProjectEntry = {
  path: string;
  width: number;
  height: number;
  output: Output["type"];
};

/** A registered project folder with its project files, or `missing` when it no longer exists. */
export type ProjectFolder = {
  directory: string;
  missing?: boolean;
  files: ProjectEntry[];
};

export type ProjectList = {
  folders: ProjectFolder[];
  /** False in the static demo, whose one folder is fixed. */
  editable: boolean;
  /** The native dialog the server can open to pick a folder, when it has one. */
  folderDialog?: "zenity" | "osascript";
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
      return {
        folders: await listProjectFolders(registry),
        editable: true,
        folderDialog: getDialogTool(),
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
    async removeProjectFolder({
      directory,
    }: {
      directory: string;
    }): Promise<void> {
      await registry.removeFolder(directory);
    },

    /** Open a registered project folder in the desktop's file manager. */
    async openProjectFolder({
      directory,
    }: {
      directory: string;
    }): Promise<void> {
      await openWithDefaultApp(await registry.resolveFolder(directory));
    },

    async loadProject({
      path: projectPath,
    }: {
      path: string;
    }): Promise<ProjectFile> {
      const file = await resolveProjectFile({ registry, projectPath });
      if (!fs.existsSync(file)) {
        throw new HttpError({ status: 404, message: "Project not found" });
      }
      return { file: projectPath, project: await readJson<Project>(file) };
    },

    async saveProject({
      path: projectPath,
      project,
    }: {
      path: string;
      project: Project;
    }): Promise<void> {
      await writeJson(
        await resolveProjectFile({ registry, projectPath }),
        project,
      );
    },

    /** Creates a project file in its folder, never overwriting an existing one. */
    async createProject({
      path: projectPath,
      project,
    }: {
      path: string;
      project: Project;
    }): Promise<void> {
      const file = await resolveProjectFile({ registry, projectPath });
      try {
        await writeJson(file, project, { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new HttpError({
            status: 409,
            message: `${path.basename(file)} already exists`,
          });
        }
        throw error;
      }
    },

    /** Probe a layer source into its media info, the entry that the project's `media` keeps for it. */
    async loadMediaInfo({
      src,
      projectPath,
    }: {
      src: string;
      projectPath: string;
    }): Promise<MediaInfo> {
      return await probeMediaInfo(
        await resolveMediaFile({ registry, projectPath, src }),
      );
    },

    /** List the media files in the project's `media/` folder. */
    async listMediaFiles({
      projectPath,
    }: {
      projectPath: string;
    }): Promise<MediaFile[]> {
      const dir = await resolveMediaFolder({ registry, projectPath });
      if (!fs.existsSync(dir)) {
        return [];
      }
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
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
    async openMediaFolder({
      projectPath,
    }: {
      projectPath: string;
    }): Promise<void> {
      const dir = await resolveMediaFolder({ registry, projectPath });
      await fs.promises.mkdir(dir, { recursive: true });
      await openWithDefaultApp(dir);
    },
  };
}

/** List each registered folder with its top-level `*.json` files that parse as projects. */
async function listProjectFolders(registry: ProjectRegistry) {
  const folders: ProjectFolder[] = [];
  for (const directory of await registry.readFolders()) {
    if (!fs.existsSync(directory)) {
      folders.push({ directory, missing: true, files: [] });
      continue;
    }
    const names = await fs.promises.readdir(directory);
    const files: ProjectEntry[] = [];
    for (const name of names) {
      if (!name.endsWith(".json") || name.startsWith(".")) {
        continue;
      }
      const project = await readProject(path.join(directory, name));
      if (project) {
        files.push({
          path: path.join(directory, name),
          width: project.canvas.width,
          height: project.canvas.height,
          output: project.output.type,
        });
      }
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    folders.push({ directory, files });
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
    projectPath: getParam(url, "project"),
    src: getParam(url, "src"),
  });
  return await serveFile({ file, request });
}

/** Resolve `src` against the project folder, as the renderer does. */
async function resolveMediaFile({
  registry,
  projectPath,
  src,
}: {
  registry: ProjectRegistry;
  projectPath: string;
  src: string;
}) {
  const file = resolveFile({
    root: await resolveProjectFolder({ registry, projectPath }),
    paths: [src],
  });
  if (!fs.existsSync(file)) {
    throw new HttpError({ status: 404, message: "Media not found" });
  }
  return file;
}

async function resolveMediaFolder({
  registry,
  projectPath,
}: {
  registry: ProjectRegistry;
  projectPath: string;
}) {
  return resolveFile({
    root: await resolveProjectFolder({ registry, projectPath }),
    paths: ["media"],
  });
}

/** Resolve an absolute project file path, which must be a `.json` file in a registered folder. */
async function resolveProjectFile({
  registry,
  projectPath,
}: {
  registry: ProjectRegistry;
  projectPath: string;
}) {
  if (path.extname(projectPath) !== ".json") {
    throw new HttpError({
      status: 400,
      message: "Project file must be a .json file",
    });
  }
  return resolveFile({
    root: await resolveProjectFolder({ registry, projectPath }),
    paths: [path.basename(projectPath)],
  });
}

// Project files sit at the top level of their folder, so the file's own
// directory is the folder to check against the registry.
async function resolveProjectFolder({
  registry,
  projectPath,
}: {
  registry: ProjectRegistry;
  projectPath: string;
}) {
  return await registry.resolveFolder(path.dirname(projectPath));
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
