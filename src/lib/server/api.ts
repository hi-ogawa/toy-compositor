import fs from "node:fs";
import path from "node:path";
import type { ProjectEntry } from "../api-client.ts";
import { getParam, HttpError, serveFile, toErrorResponse } from "./http.ts";

/**
 * Editor API over a projects root laid out as `<root>/<project-dir>/<name>.json`
 * with media next to each project. Files are named by paths relative to
 * `root` in query parameters, so a file path is never encoded as a URL path.
 *
 * - `GET /api/projects` lists the projects.
 * - `GET /api/project?path=` reads a project, and `PUT` saves it.
 * - `GET /api/media?project=&src=` serves a layer source resolved against the
 *   project's directory, as the renderer does, with range requests.
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
    const json = JSON.parse(await fs.promises.readFile(file, "utf-8"));
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
  const project = await request.json();
  await fs.promises.writeFile(file, JSON.stringify(project, null, 2) + "\n");
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
  const project = getParam(url, "project");
  const src = getParam(url, "src");
  const file = resolveFile({ root, paths: [path.dirname(project), src] });
  if (!fs.existsSync(file)) {
    throw new HttpError({ status: 404, message: "Media not found" });
  }
  return await serveFile({ file, request });
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
