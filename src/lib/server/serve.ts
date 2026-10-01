import { serve } from "srvx";
import { staticMiddleware } from "srvx/static";
import { createEditorHandler, SERVER_NAME } from "./api.ts";
import type { LiveConnections } from "./live.ts";
import type { ProjectRegistry } from "./registry.ts";

/**
 * Serve the prebuilt editor client and the editor API over the registered
 * project folders on localhost, with the same `/api/` handler that the dev server mounts.
 */
export async function serveEditor({
  registry,
  live,
  port,
  clientDir,
}: {
  registry: ProjectRegistry;
  live: LiveConnections;
  port: number;
  clientDir: string;
}) {
  const handleApi = createEditorHandler({ registry, live });
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

function isLocalHost(host: string | null) {
  const name = host?.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

/** Whether an editor server, rather than another process, answers on `port`. */
export async function checkEditorServer(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/api/server`);
    return res.ok && (await res.json()).name === SERVER_NAME;
  } catch {
    return false;
  }
}
