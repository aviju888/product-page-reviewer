import { z } from "zod";
import { sseResponse } from "@/lib/sse";
import { runAudit } from "@/lib/reviewer/pipeline";

/* POST { url, siteType? } → SSE: task, capture, boxes, page, classify, signal×N, scores, recommendations, done */





const Body = z.object({
  url: z.string().trim().min(1, "Paste a link to a product page.").max(2048, "That link is too long."),
  siteType: z.enum(["auto", "ecommerce", "saas", "b2b"]).optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: 'Send a JSON body like { "url": "https://…" }.' }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  return sseResponse(req, (send, signal) => runAudit(parsed.data, send, signal));
}
