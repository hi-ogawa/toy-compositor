import fs from "node:fs";
import path from "node:path";
import { staticMiddleware } from "srvx/static";

/** URL prefix under which files in the editor root are served. */
export const FILES_PREFIX = "/files/";

// Local sample projects live under the gitignored `.local/`. Other dot paths,
// such as `.git/`, stay hidden for reads and saves.
const ALLOWED_DOTFILES = [".local"];

/**
 * Serve files under `root` at `/files/*`, and accept project saves as `PUT`
 * of `.json` files there. The client resolves media relative to the project
 * URL, so the same layout works from a static host.
 */
export function createEditorHandler({ root }: { root: string }) {
  const serveFile = staticMiddleware({ dir: root, dotfiles: ALLOWED_DOTFILES });
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(FILES_PREFIX)) {
        return new Response(undefined, { status: 404 });
      }
      const relative = decodeURIComponent(
        url.pathname.slice(FILES_PREFIX.length),
      );
      const file = path.resolve(root, relative);
      if (
        !file.startsWith(root + path.sep) ||
        path
          .relative(root, file)
          .split(path.sep)
          .some((s) => s.startsWith(".") && !ALLOWED_DOTFILES.includes(s))
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
