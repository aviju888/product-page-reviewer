/* ─────────────────────────────────────────────────────────
 * SSE (server) — wrap a long-running pipeline as a stream of
 * named events. Every stream ends with a `done` event; thrown
 * errors become an `error` event first.
 *
 *   export async function POST(req: Request) {
 *     return sseResponse(req, async (send, signal) => {
 *       send("task", { id: "scrape", status: "running" });
 *     });
 *   }
 * ───────────────────────────────────────────────────────── */

export type SSESend = (event: string, data: unknown) => void;

export function encodeFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sseResponse(
  req: Request,
  run: (send: SSESend, signal: AbortSignal) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send: SSESend = (event, data) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeFrame(event, data)));
        } catch {
          open = false;
        }
      };
      try {
        await run(send, abort.signal);
      } catch (err) {
        if (!abort.signal.aborted) {
          send("error", { message: err instanceof Error ? err.message : String(err) });
        }
      } finally {
        send("done", {});
        open = false;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
