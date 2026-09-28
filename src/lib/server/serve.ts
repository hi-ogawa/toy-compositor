import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { serve } from "srvx";
import { staticMiddleware } from "srvx/static";
import { createEditorHandler } from "./api.ts";

export const DEFAULT_ROOT = path.join(
  os.homedir(),
  "Documents",
  "toy-compositor",
);

/**
 * Serve the prebuilt editor client and the editor API over `root` on
 * localhost, with the same `/api/` handler that the dev server mounts.
 * `allowedHosts` adds hosts beyond localhost, as exact names or as `.domain`
 * for a domain and its subdomains, like Vite's `server.allowedHosts`.
 */
export async function serveEditor({
  root,
  port,
  clientDir,
  allowedHosts,
}: {
  root: string;
  port: number;
  clientDir: string;
  allowedHosts: string[];
}) {
  fs.mkdirSync(root, { recursive: true });
  const handleApi = createEditorHandler({ root });
  const serveClient = staticMiddleware({ dir: clientDir });
  const server = serve({
    hostname: "localhost",
    port,
    silent: true,
    fetch: async (request) => {
      // Only answer requests addressed to allowed hosts, so a page on another
      // origin that rebinds its DNS to 127.0.0.1 cannot read or write files.
      if (!isAllowedHost({ host: request.headers.get("host"), allowedHosts })) {
        return new Response("Forbidden host", { status: 403 });
      }
      if (new URL(request.url).pathname.startsWith("/api/")) {
        return handleApi(request);
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

function isAllowedHost({
  host,
  allowedHosts,
}: {
  host: string | null;
  allowedHosts: string[];
}) {
  const name = host?.replace(/:\d+$/, "");
  if (!name) {
    return false;
  }
  return ["localhost", "127.0.0.1", "[::1]", ...allowedHosts].some((allowed) =>
    allowed.startsWith(".")
      ? name === allowed.slice(1) || name.endsWith(allowed)
      : name === allowed,
  );
}
