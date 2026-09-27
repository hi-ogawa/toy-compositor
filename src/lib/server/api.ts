// Fetch handler for the editor. It loads and saves one project file and
// serves the media it references, with range requests so video can seek.

import fs from "node:fs";
import path from "node:path";
import type { ServerRequest } from "srvx";
import { staticMiddleware } from "srvx/static";

export function createEditorHandler({ projectFile }: { projectFile: string }) {
  const serveMedia = staticMiddleware({ dir: path.dirname(projectFile) });
  return async (request: ServerRequest): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/project" && request.method === "GET") {
        const content = await fs.promises.readFile(projectFile, "utf-8");
        return Response.json({
          file: path.relative(process.cwd(), projectFile),
          project: JSON.parse(content),
        });
      }
      if (url.pathname === "/api/project" && request.method === "PUT") {
        const project = await request.json();
        await fs.promises.writeFile(
          projectFile,
          JSON.stringify(project, null, 2) + "\n",
        );
        return Response.json({});
      }
      if (url.pathname.startsWith("/api/media/")) {
        url.pathname = url.pathname.slice("/api/media".length);
        request._url = url;
        return await serveMedia(
          request,
          () => new Response(undefined, { status: 404 }),
        );
      }
      return new Response(undefined, { status: 404 });
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
