import fs from "node:fs";
import path from "node:path";
import { staticMiddleware } from "srvx/static";
import type { ProjectEntry } from "../project-storage.ts";

/** URL prefix under which files in the projects root are served. */
export const FILES_PREFIX = "/files/";

const PROJECTS_PATH = "/api/projects";

/** Whether a request path belongs to the editor server rather than the client. */
export function isEditorPath(pathname: string) {
  return pathname.startsWith(FILES_PREFIX) || pathname === PROJECTS_PATH;
}

/**
 * Serve a projects root laid out as `<root>/<cover>/<project>.json` with
 * media next to each project. Files are served at `/files/*`, project saves
 * are `PUT` of `.json` files there, and `/api/projects` lists the projects.
 */
export function createEditorHandler({ root }: { root: string }) {
  const serveFile = staticMiddleware({ dir: root });
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.pathname === PROJECTS_PATH && request.method === "GET") {
        return Response.json({ root, projects: await listProjects({ root }) });
      }
      if (!url.pathname.startsWith(FILES_PREFIX)) {
        return new Response(undefined, { status: 404 });
      }
      const relative = decodeURIComponent(
        url.pathname.slice(FILES_PREFIX.length),
      );
      const file = path.resolve(root, relative);
      // Keep hidden paths, such as a cover's future caches, out of reach.
      if (
        !file.startsWith(root + path.sep) ||
        path
          .relative(root, file)
          .split(path.sep)
          .some((s) => s.startsWith("."))
      ) {
        return new Response("Path is not served by the editor", {
          status: 403,
        });
      }
      if (request.method === "PUT") {
        if (path.extname(file) !== ".json") {
          return new Response("Only .json files can be saved", {
            status: 403,
          });
        }
        const project = await request.json();
        await fs.promises.writeFile(
          file,
          JSON.stringify(project, null, 2) + "\n",
        );
        return Response.json({});
      }
      url.pathname = "/" + url.pathname.slice(FILES_PREFIX.length);
      return await serveFile(
        new Request(url, request),
        () => new Response(undefined, { status: 404 }),
      );
    } catch (error) {
      return new Response(
        error instanceof Error ? error.message : String(error),
        {
          status: 500,
        },
      );
    }
  };
}

/** List `<root>/<cover>/*.json` files that parse as projects. */
async function listProjects({ root }: { root: string }) {
  const entries: ProjectEntry[] = [];
  const covers = await fs.promises
    .readdir(root, { withFileTypes: true })
    .catch(() => []);
  for (const cover of covers) {
    if (!cover.isDirectory() || cover.name.startsWith(".")) {
      continue;
    }
    const files = await fs.promises.readdir(path.join(root, cover.name));
    for (const name of files) {
      if (!name.endsWith(".json") || name.startsWith(".")) {
        continue;
      }
      const project = await readProject(path.join(root, cover.name, name));
      if (project) {
        entries.push({
          path: `${cover.name}/${name}`,
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
