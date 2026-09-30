import { createRpcProxy } from "./rpc.ts";
import type { EditorHandlers } from "./server/api.ts";

const rpcClient = createRpcProxy<EditorHandlers>(async (method, params) => {
  const res = await fetch(`/api/rpc/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
});

/** Client for the raw media route, which media elements point at directly. */
const mediaClient = {
  /**
   * The server resolves a layer source against the project's directory, as the
   * renderer does, so `src` is a file path everywhere.
   */
  getMediaUrl({
    src,
    projectPath,
  }: {
    src: string;
    projectPath: string;
  }): string {
    return `/api/media?${new URLSearchParams({ project: projectPath, src })}`;
  },

  /** Fetches a video or audio source's encoded bytes for decoding its audio. */
  async loadAudioData({
    src,
    projectPath,
  }: {
    src: string;
    projectPath: string;
  }): Promise<ArrayBuffer> {
    const res = await fetch(mediaClient.getMediaUrl({ src, projectPath }));
    if (!res.ok) {
      throw new Error(`Failed to load audio data: ${await res.text()}`);
    }
    return res.arrayBuffer();
  },
};

/**
 * Client for the editor server's RPC methods at `/api/rpc/<method>`, plus the
 * raw media route. The RPC proxy is the prototype, so any method not on
 * `mediaClient` becomes an RPC call.
 */
export const apiClient = Object.assign(
  Object.create(rpcClient) as typeof rpcClient,
  mediaClient,
);
