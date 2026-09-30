import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "../../utils/fs.ts";
import { getMediaType, type MediaFile } from "../media-file.ts";
import { probeMediaInfo } from "../media-info.ts";
import type { MediaInfo, Output, Project } from "../project.ts";
import { getParam, HttpError, serveFile, toErrorResponse } from "./http.ts";

/**
 * Editor API over a projects root laid out as `<root>/<project-dir>/<name>.json`
 * with media next to each project. Files are named by paths relative to
 * `root`, so a file path is never encoded as a URL path.
 *
 * - `POST /api/rpc/<method>` calls one of `createEditorHandlers`' methods with
 *   the JSON body as its params, and answers with its JSON result.
 * - `GET /api/media?project=&src=` serves a layer source resolved against the
 *   project's directory, as the renderer does, with range requests.
 */
export function createEditorHandler({ root }: { root: string }) {
  const handlers = createEditorHandlers({ root });
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
          return await handleMedia({ root, url, request });
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

export type ProjectFile = { file: string; project: Project };

/** A project file found under the projects root, as `<project-dir>/<name>.json`. */
export type ProjectEntry = {
  path: string;
  width: number;
  height: number;
  output: Output["type"];
};

export type ProjectList = { root: string; projects: ProjectEntry[] };

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
export function createEditorHandlers({ root }: { root: string }) {
  return {
    async listProjects(): Promise<ProjectList> {
      return { root, projects: await listProjects({ root }) };
    },

    async loadProject({
      path: projectPath,
    }: {
      path: string;
    }): Promise<ProjectFile> {
      const file = resolveFile({ root, paths: [projectPath] });
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
      const file = resolveFile({ root, paths: [projectPath] });
      if (path.extname(file) !== ".json") {
        throw new HttpError({
          status: 403,
          message: "Only .json files can be saved",
        });
      }
      await writeJson(file, project);
    },

    /**
     * Create `<project-dir>/<name>.json`, and the project directory if needed.
     * The directory may already exist, such as when media was put there first,
     * but an existing project file is never overwritten.
     */
    async createProject({
      path: projectPath,
      project,
    }: {
      path: string;
      project: Project;
    }): Promise<void> {
      const segments = projectPath.split("/");
      if (
        segments.length !== 2 ||
        segments.some((s) => !s) ||
        path.extname(projectPath) !== ".json"
      ) {
        throw new HttpError({
          status: 400,
          message: "Project path must be <project-dir>/<name>.json",
        });
      }
      const file = resolveFile({ root, paths: [projectPath] });
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      try {
        await writeJson(file, project, { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new HttpError({
            status: 409,
            message: `${projectPath} already exists`,
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
      return await probeMediaInfo(resolveMediaFile({ root, projectPath, src }));
    },

    /** List the media files in the project's `media/` folder. */
    async listMediaFiles({
      projectPath,
    }: {
      projectPath: string;
    }): Promise<MediaFile[]> {
      const dir = resolveMediaFolder({ root, projectPath });
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
      const dir = resolveMediaFolder({ root, projectPath });
      await fs.promises.mkdir(dir, { recursive: true });
      const opener = process.platform === "darwin" ? "open" : "xdg-open";
      const child = spawn(opener, [dir], { detached: true, stdio: "ignore" });
      // Rejects when the opener is missing.
      await once(child, "spawn");
      child.unref();
    },
  };
}

/** List `<root>/<project-dir>/*.json` files that parse as projects. */
async function listProjects({ root }: { root: string }) {
  const entries: ProjectEntry[] = [];
  const projectDirs = await fs.promises
    .readdir(root, { withFileTypes: true })
    .catch(() => []);
  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory() || projectDir.name.startsWith(".")) {
      continue;
    }
    const files = await fs.promises.readdir(path.join(root, projectDir.name));
    for (const name of files) {
      if (!name.endsWith(".json") || name.startsWith(".")) {
        continue;
      }
      const project = await readProject(path.join(root, projectDir.name, name));
      if (project) {
        entries.push({
          path: `${projectDir.name}/${name}`,
          width: project.canvas.width,
          height: project.canvas.height,
          output: project.output.type,
        });
      }
    }
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

async function readProject(file: string) {
  try {
    const json = await readJson<any>(file);
    if (json.canvas && Array.isArray(json.layers)) {
      return json;
    }
  } catch {}
}

/** Serve a layer source resolved against the project's directory, as the renderer does. */
async function handleMedia({
  root,
  url,
  request,
}: {
  root: string;
  url: URL;
  request: Request;
}) {
  const file = resolveMediaFile({
    root,
    projectPath: getParam(url, "project"),
    src: getParam(url, "src"),
  });
  return await serveFile({ file, request });
}

/** Resolve `src` against the project's directory, as the renderer does. */
function resolveMediaFile({
  root,
  projectPath,
  src,
}: {
  root: string;
  projectPath: string;
  src: string;
}) {
  const file = resolveFile({ root, paths: [path.dirname(projectPath), src] });
  if (!fs.existsSync(file)) {
    throw new HttpError({ status: 404, message: "Media not found" });
  }
  return file;
}

function resolveMediaFolder({
  root,
  projectPath,
}: {
  root: string;
  projectPath: string;
}) {
  return resolveFile({ root, paths: [path.dirname(projectPath), "media"] });
}

/**
 * Resolve `paths` against `root`, rejecting files outside it and hidden paths,
 * such as a project directory's future caches.
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
