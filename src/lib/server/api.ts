import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "../../utils/fs.ts";
import type { ProjectEntry } from "../api-client.ts";
import { getMediaType, type MediaFile } from "../media-file.ts";
import { probeMediaInfo } from "../media-info.ts";
import { getParam, HttpError, serveFile, toErrorResponse } from "./http.ts";

/**
 * Editor API over a projects root laid out as `<root>/<project-dir>/<name>.json`
 * with media next to each project. Files are named by paths relative to
 * `root` in query parameters, so a file path is never encoded as a URL path.
 *
 * - `GET /api/projects` lists the projects.
 * - `GET /api/project?path=` reads a project, `PUT` saves it, and `POST`
 *   creates a new one.
 * - `GET /api/media?project=&src=` serves a layer source resolved against the
 *   project's directory, as the renderer does, with range requests.
 * - `GET /api/media-info?project=&src=` probes a layer source into its media
 *   info, the entry that the project's `media` keeps for it.
 * - `GET /api/media-files?project=` lists the media files in the project's
 *   `media/` folder, and `POST /api/open-media-folder?project=` opens that
 *   folder in the desktop's file manager, creating it first if needed.
 */
export function createEditorHandler({ root }: { root: string }) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      switch (`${request.method} ${url.pathname}`) {
        case "GET /api/projects": {
          return Response.json({
            root,
            projects: await listProjects({ root }),
          });
        }
        case "GET /api/project": {
          return await handleGetProject({ root, url });
        }
        case "PUT /api/project": {
          return await handlePutProject({ root, url, request });
        }
        case "POST /api/project": {
          return await handleCreateProject({ root, url, request });
        }
        case "GET /api/media":
        case "HEAD /api/media": {
          return await handleMedia({ root, url, request });
        }
        case "GET /api/media-info": {
          return Response.json(
            await probeMediaInfo(resolveMediaFile({ root, url })),
          );
        }
        case "GET /api/media-files": {
          return Response.json({ files: await listMediaFiles({ root, url }) });
        }
        case "POST /api/open-media-folder": {
          await openMediaFolder({ root, url });
          return Response.json({});
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

async function handleGetProject({ root, url }: { root: string; url: URL }) {
  const file = resolveFile({ root, paths: [getParam(url, "path")] });
  if (!fs.existsSync(file)) {
    throw new HttpError({ status: 404, message: "Project not found" });
  }
  return new Response(await fs.promises.readFile(file), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handlePutProject({
  root,
  url,
  request,
}: {
  root: string;
  url: URL;
  request: Request;
}) {
  const file = resolveFile({ root, paths: [getParam(url, "path")] });
  if (path.extname(file) !== ".json") {
    throw new HttpError({
      status: 403,
      message: "Only .json files can be saved",
    });
  }
  await writeJson(file, await request.json());
  return Response.json({});
}

/**
 * Create `<project-dir>/<name>.json`, and the project directory if needed. The
 * directory may already exist, such as when media was put there first, but an
 * existing project file is never overwritten.
 */
async function handleCreateProject({
  root,
  url,
  request,
}: {
  root: string;
  url: URL;
  request: Request;
}) {
  const projectPath = getParam(url, "path");
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
    await writeJson(file, await request.json(), { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new HttpError({
        status: 409,
        message: `${projectPath} already exists`,
      });
    }
    throw error;
  }
  return Response.json({});
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
  return await serveFile({ file: resolveMediaFile({ root, url }), request });
}

/** Resolve `?src=` against the directory of the `?project=` file, as the renderer does. */
function resolveMediaFile({ root, url }: { root: string; url: URL }) {
  const project = getParam(url, "project");
  const src = getParam(url, "src");
  const file = resolveFile({ root, paths: [path.dirname(project), src] });
  if (!fs.existsSync(file)) {
    throw new HttpError({ status: 404, message: "Media not found" });
  }
  return file;
}

/** List files with a media extension in the project's `media/` folder, which may not exist yet. */
async function listMediaFiles({ root, url }: { root: string; url: URL }) {
  const dir = resolveMediaFolder({ root, url });
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
}

/**
 * Open the project's `media/` folder with the platform's opener on the
 * server's desktop, creating it first if needed.
 */
async function openMediaFolder({ root, url }: { root: string; url: URL }) {
  const dir = resolveMediaFolder({ root, url });
  await fs.promises.mkdir(dir, { recursive: true });
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [dir], { detached: true, stdio: "ignore" });
  // Rejects when the opener is missing.
  await once(child, "spawn");
  child.unref();
}

function resolveMediaFolder({ root, url }: { root: string; url: URL }) {
  return resolveFile({
    root,
    paths: [path.dirname(getParam(url, "project")), "media"],
  });
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
