import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { serve } from "srvx";
import { staticMiddleware } from "srvx/static";
import { createEditorHandler, isEditorPath } from "./api.ts";

export const DEFAULT_ROOT = path.join(
  os.homedir(),
  "Documents",
  "toy-compositor",
);

/**
 * Serve the prebuilt editor client and the files under `root` on localhost,
 * the same handler that the dev server mounts.
 */
export async function serveEditor({
  root,
  port,
  clientDir,
}: {
  root: string;
  port: number;
  clientDir: string;
}) {
  fs.mkdirSync(root, { recursive: true });
  const handleEditor = createEditorHandler({ root });
  const serveClient = staticMiddleware({ dir: clientDir });
  const server = serve({
    hostname: "localhost",
    port,
    silent: true,
    fetch: async (request) => {
      // Only answer requests addressed to localhost, so a page on another
      // origin that rebinds its DNS to 127.0.0.1 cannot read or write files.
      if (!isLocalHost(request.headers.get("host"))) {
        return new Response("Forbidden host", { status: 403 });
      }
      if (isEditorPath(new URL(request.url).pathname)) {
        return handleEditor(request);
      }
      return serveClient(
        request,
        () => new Response(undefined, { status: 404 }),
      );
    },
  });
  await server.ready();
  return server;
}

function isLocalHost(host: string | null) {
  const name = host?.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}
