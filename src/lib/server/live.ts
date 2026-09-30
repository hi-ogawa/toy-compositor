/**
 * The editor tabs' live connections. Each open tab, the start page or the
 * editor, holds one `GET /api/live` event stream, so the server knows when the
 * last tab closes.
 */
export function createLiveConnections() {
  let count = 0;
  const listeners = new Set<() => void>();

  function updateCount(delta: number) {
    count += delta;
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    /** Answer a tab with an event stream that stays open until the tab closes. */
    handleRequest(): Response {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          updateCount(1);
          controller.enqueue(new TextEncoder().encode(": connected\n\n"));
        },
        // The server cancels the body when the tab's connection closes.
        cancel() {
          updateCount(-1);
        },
      });
      return new Response(body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
        },
      });
    },

    /**
     * Resolve once no tab has been connected for `graceMs` since the last one
     * closed. A reload reconnects within the grace period, so it does not count.
     */
    waitForLastClose({ graceMs }: { graceMs: number }): Promise<void> {
      return new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const listener = () => {
          clearTimeout(timer);
          if (count === 0) {
            timer = setTimeout(() => {
              listeners.delete(listener);
              resolve();
            }, graceMs);
          }
        };
        listeners.add(listener);
      });
    },
  };
}

export type LiveConnections = ReturnType<typeof createLiveConnections>;
