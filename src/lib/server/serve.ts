import { setTimeout as sleep } from "node:timers/promises";
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
  const handleApi = createEditorHandler({
    registry,
    live,
    // Close once the stop reply's response closes, so the reply reaches the
    // CLI. Closing all connections ends the tabs' live streams, which would
    // otherwise keep the server open.
    stop: (request) =>
      request.runtime?.node?.res?.once("close", () => server.close(true)),
  });
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
      // A page on another site can still send a request that needs no
      // preflight, such as a form POST, to localhost. The browser marks it
      // with that site's origin, while the editor's own pages send none or
      // this server's.
      const origin = request.headers.get("origin");
      if (origin && origin !== `http://${request.headers.get("host")}`) {
        return new Response("Forbidden origin", { status: 403 });
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

/**
 * Stop the editor server on `port` and wait until it no longer answers.
 * Resolve to false when no editor server, but possibly another process, was
 * on the port, which is left alone.
 */
export async function stopEditorServer(port: number): Promise<boolean> {
  if (!(await checkEditorServer(port))) {
    return false;
  }
  const res = await fetch(`http://localhost:${port}/api/server/stop`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(
      `The editor server on port ${port} cannot be stopped (${res.status})`,
    );
  }
  // The server closes right after sending the reply, so in practice the first
  // check already finds it gone. Retry for a second in case it lags.
  for (let i = 0; i < 10; i++) {
    if (!(await checkEditorServer(port))) {
      return true;
    }
    if (i === 0) {
      console.log(`Waiting for the editor server on port ${port} to stop`);
    }
    await sleep(100);
  }
  throw new Error(
    `The editor server on port ${port} still answers 1s after the stop request`,
  );
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
