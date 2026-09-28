import fs from "node:fs";
import path from "node:path";
import { getParam, HttpError, serveFile, toErrorResponse } from "./http.ts";

/**
 * Editor API over files under `root`. Files are named by paths relative to
 * `root` in query parameters, so a file path is never encoded as a URL path.
 *
 * - `GET /api/project?path=` reads a project, and `PUT` saves it.
 * - `GET /api/media?project=&src=` serves a layer source resolved against the
 *   project's directory, as the renderer does, with range requests.
 */
export function createEditorHandler({ root }: { root: string }) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      switch (`${request.method} ${url.pathname}`) {
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

async function handleGetProject({ root, url }: { root: string; url: URL }) {
  const file = resolveFile({ root, paths: [getParam({ url, name: "path" })] });
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
  const file = resolveFile({ root, paths: [getParam({ url, name: "path" })] });
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
  const project = getParam({ url, name: "project" });
  const src = getParam({ url, name: "src" });
  const file = resolveFile({ root, paths: [path.dirname(project), src] });
  if (!fs.existsSync(file)) {
    throw new HttpError({ status: 404, message: "Media not found" });
  }
  return await serveFile({ file, request });
}

/**
 * Resolve `paths` against `root`, rejecting files outside it and hidden paths,
 * such as a cover's future caches.
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
