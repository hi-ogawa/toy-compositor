import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "../../utils/fs.ts";
import type {
  ProjectEntry,
  ProjectFolder,
  ProjectList,
} from "../api-client.ts";
import { getMediaType, type MediaFile } from "../media-file.ts";
import { probeMediaInfo } from "../media-info.ts";
import { getDialogTool, pickProjectPath } from "./dialog.ts";
import { getParam, HttpError, serveFile, toErrorResponse } from "./http.ts";
import type { ProjectRegistry } from "./registry.ts";

/**
 * Editor API over the registered project folders. A project folder holds its
 * project files at the top level and media next to them, and only files inside
 * a registered folder are served or saved. Folders are named by absolute path
 * and files by paths relative to the folder, in query parameters, so a file
 * path is never encoded as a URL path.
 *
 * - `GET /api/projects` lists the registered folders with their project files.
 * - `POST /api/project-folders` registers a typed folder or project file path,
 *   `POST /api/pick-project-folder?kind=` registers one picked in the native
 *   dialog, and `DELETE /api/project-folders?project=` forgets a folder.
 * - `GET /api/project?project=&file=` reads a project file, `PUT` saves it,
 *   and `POST` creates a new one.
 * - `GET /api/media?project=&src=` serves a layer source resolved against the
 *   project folder, as the renderer does, with range requests.
 * - `GET /api/media-info?project=&src=` probes a layer source into its media
 *   info, the entry that the project's `media` keeps for it.
 * - `GET /api/media-files?project=` lists the media files in the project's
 *   `media/` folder, and `POST /api/open-media-folder?project=` opens that
 *   folder in the desktop's file manager, creating it first if needed.
 */
export function createEditorHandler({
  registry,
}: {
  registry: ProjectRegistry;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      switch (`${request.method} ${url.pathname}`) {
        case "GET /api/projects": {
          const dialog = getDialogTool();
          const list: ProjectList = {
            folders: await listProjectFolders(registry),
            add: dialog ? { dialog } : {},
          };
          return Response.json(list);
        }
        case "POST /api/project-folders": {
          const { path } = await request.json();
          return Response.json({ dir: await registry.addFolder(path) });
        }
        case "POST /api/pick-project-folder": {
          const kind = getParam(url, "kind");
          if (kind !== "folder" && kind !== "file") {
            throw new HttpError({
              status: 400,
              message: `Invalid kind ${kind}`,
            });
          }
          const picked = await pickProjectPath({ kind });
          return Response.json({
            dir: picked && (await registry.addFolder(picked)),
          });
        }
        case "DELETE /api/project-folders": {
          await registry.removeFolder(getParam(url, "project"));
          return Response.json({});
        }
        case "GET /api/project": {
          return await handleGetProject({ registry, url });
        }
        case "PUT /api/project": {
          return await handlePutProject({ registry, url, request });
        }
        case "POST /api/project": {
          return await handleCreateProject({ registry, url, request });
        }
        case "GET /api/media":
        case "HEAD /api/media": {
          return await handleMedia({ registry, url, request });
        }
        case "GET /api/media-info": {
          return Response.json(
            await probeMediaInfo(await resolveMediaFile({ registry, url })),
          );
        }
        case "GET /api/media-files": {
          return Response.json({
            files: await listMediaFiles({ registry, url }),
          });
        }
        case "POST /api/open-media-folder": {
          await openMediaFolder({ registry, url });
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

async function handleGetProject({
  registry,
  url,
}: {
  registry: ProjectRegistry;
  url: URL;
}) {
  const file = await resolveProjectFile({ registry, url });
  if (!fs.existsSync(file)) {
    throw new HttpError({ status: 404, message: "Project not found" });
  }
  return new Response(await fs.promises.readFile(file), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handlePutProject({
  registry,
  url,
  request,
}: {
  registry: ProjectRegistry;
  url: URL;
  request: Request;
}) {
  const file = await resolveProjectFile({ registry, url });
  await writeJson(file, await request.json());
  return Response.json({});
}

/** Create a project file in its folder, never overwriting an existing one. */
async function handleCreateProject({
  registry,
  url,
  request,
}: {
  registry: ProjectRegistry;
  url: URL;
  request: Request;
}) {
  const file = await resolveProjectFile({ registry, url });
  try {
    await writeJson(file, await request.json(), { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new HttpError({
        status: 409,
        message: `${path.basename(file)} already exists`,
      });
    }
    throw error;
  }
  return Response.json({});
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
  return await serveFile({
    file: await resolveMediaFile({ registry, url }),
    request,
  });
}

/** Resolve `?src=` against the `?project=` folder, as the renderer does. */
async function resolveMediaFile({
  registry,
  url,
}: {
  registry: ProjectRegistry;
  url: URL;
}) {
  const file = resolveFile({
    root: await registry.resolveFolder(getParam(url, "project")),
    paths: [getParam(url, "src")],
  });
  if (!fs.existsSync(file)) {
    throw new HttpError({ status: 404, message: "Media not found" });
  }
  return file;
}

async function listMediaFiles({
  registry,
  url,
}: {
  registry: ProjectRegistry;
  url: URL;
}) {
  const dir = await resolveMediaFolder({ registry, url });
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

async function openMediaFolder({
  registry,
  url,
}: {
  registry: ProjectRegistry;
  url: URL;
}) {
  const dir = await resolveMediaFolder({ registry, url });
  await fs.promises.mkdir(dir, { recursive: true });
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [dir], { detached: true, stdio: "ignore" });
  // Rejects when the opener is missing.
  await once(child, "spawn");
  child.unref();
}

async function resolveMediaFolder({
  registry,
  url,
}: {
  registry: ProjectRegistry;
  url: URL;
}) {
  return resolveFile({
    root: await registry.resolveFolder(getParam(url, "project")),
    paths: ["media"],
  });
}

/** Resolve `?file=` as a `.json` file at the top level of the `?project=` folder. */
async function resolveProjectFile({
  registry,
  url,
}: {
  registry: ProjectRegistry;
  url: URL;
}) {
  const name = getParam(url, "file");
  if (path.basename(name) !== name || path.extname(name) !== ".json") {
    throw new HttpError({
      status: 400,
      message: "Project file must be <name>.json in the project folder",
    });
  }
  return resolveFile({
    root: await registry.resolveFolder(getParam(url, "project")),
    paths: [name],
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
