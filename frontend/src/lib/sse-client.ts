/* ─────────────────────────────────────────────────────────
 * SSE (client) — POST a JSON body and receive named events.
 * fetch-based (EventSource can't POST).
 *
 *   await postSSE("/api/reviewer/audit", { url }, (event, data) => {...}, signal);
 * ───────────────────────────────────────────────────────── */

export type SSEFrame = { event: string; data: unknown };

/** Parses one `event:/data:` frame. Returns null for comments or empty frames. */
export function parseFrame(frame: string): SSEFrame | null {
  let event = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (data.length === 0) return null;
  const raw = data.join("\n");
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

/** Splits a growing buffer into complete frames plus the unfinished remainder. */
export function splitFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = parts.pop() ?? "";
  return { frames: parts.filter((p) => p.trim().length > 0), rest };
}

export async function postSSE(
  url: string,
  body: unknown,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${detail.slice(0, 200)}`.trim());
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  const deliver = (frame: string) => {
    const parsed = parseFrame(frame);
    if (!parsed) return;
    if (parsed.event === "done" || parsed.event === "error") terminal = true;
    onEvent(parsed.event, parsed.data);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = splitFrames(buffer);
      buffer = rest;
      for (const f of frames) {
        deliver(f);
      }
    }
    buffer += decoder.decode();
    deliver(buffer);
    signal?.throwIfAborted();
    if (!terminal) throw new Error("The audit stream ended before a completion or error event.");
  } finally {
    reader.releaseLock();
  }
}
