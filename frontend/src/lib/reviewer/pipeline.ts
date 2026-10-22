import { readFile } from "node:fs/promises";
import path from "node:path";
import { hasLLM } from "@/lib/llm";
import { sleep } from "@/lib/scripted";
import type { SSESend } from "@/lib/sse";
import { capturePage, CaptureError, fetchHtml, looksBlocked, VIEWPORT, type Captured } from "./capture";
import { ctaTexts, detectSiteType, getDynamicKeywords, runHeuristics } from "./heuristics";
import { load, pageText } from "./heuristics/dom";
import { recommend } from "./recommend";
import { SAMPLES, sampleIdOf } from "./samples";
import { PAGE_LABELS, scoreSignals, SITE_LABELS, statusCounts } from "./score";
import { createRequestGuard, parseTarget, resolvePublic, UrlError } from "./ssrf";
import type {
  AuditRequest,
  CaptureEngine,
  CaptureEvent,
  ClassifyEvent,
  ScoresEvent,
  TaskDetail,
  TaskEvent,
  TaskId,
  TaskStatus,
} from "./types";

/* ─────────────────────────────────────────────────────────
 * PIPELINE — one audit as a stream of SSE events:
 *   task* → capture → boxes → page → classify → signal×N
 *   → scores → recommendations   (lib/sse adds done/error)
 * Checks stream ~40ms apart so the UI visibly fills in.
 * ───────────────────────────────────────────────────────── */

export const TASK_ORDER: TaskId[] = ["capture", "classify", "checks", "score", "report"];

export const TASK_LABELS: Record<TaskId, string> = {
  capture: "Capture the page",
  classify: "Classify the page",
  checks: "Run the checks",
  score: "Score it",
  report: "Write the fixes",
};

const SIGNAL_GAP_MS = 38;
const n = (v: number) => v.toLocaleString("en-US");
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function titleOf(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : "";
}

function rawCapture(html: string, url: string, engine: CaptureEngine, elapsedMs: number): Captured {
  return {
    html,
    finalUrl: url,
    title: titleOf(html),
    screenshot: null,
    screenshotBelow: null,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    pageHeight: 0,
    viewportHeight: VIEWPORT.height,
    boxes: [],
    rendered: null,
    engine,
    elapsedMs,
  };
}

class BlockedError extends Error {}

const withHint = (msg: string) => `${msg.replace(/\.$/, "")}. Try again or use a sample.`;

async function captureUrl(
  input: string,
  ctaFor: (html: string) => string[],
  signal: AbortSignal,
): Promise<{ captured: Captured; note?: string }> {
  const url = parseTarget(input);
  await resolvePublic(url.hostname);
  const guard = createRequestGuard();

  let browserError: string | null = null;
  try {
    const captured = await capturePage({ kind: "url", url }, { signal, ctaTexts: ctaFor, guard });
    if (!looksBlocked(captured.title, captured.status)) return { captured };
    // challenged: plain HTML sometimes gets through where the browser didn't
    const fetched = await fetchHtml(url, { signal, guard }).catch(() => null);
    if (fetched && !looksBlocked(titleOf(fetched.html))) {
      return {
        captured: rawCapture(fetched.html, fetched.finalUrl, "fetch", fetched.elapsedMs),
        note: "The site challenged the browser, so this audit reads the raw HTML.",
      };
    }
    throw new BlockedError(
      captured.status && captured.status >= 400
        ? `The site answered ${captured.status} and blocked the visit. Try another page or use a sample.`
        : "The site showed a bot check instead of the page. Try another page or use a sample.",
    );
  } catch (err) {
    if (signal.aborted || err instanceof BlockedError || err instanceof UrlError) throw err;
    if (err instanceof CaptureError && /private network/.test(err.message)) throw err;
    browserError = err instanceof Error ? err.message : String(err);
  }

  try {
    const fetched = await fetchHtml(url, { signal, guard });
    return {
      captured: rawCapture(fetched.html, fetched.finalUrl, "fetch", fetched.elapsedMs),
      note: "The browser couldn't render it, so this audit reads the raw HTML and skips the screenshot.",
    };
  } catch (err) {
    if (signal.aborted) throw err;
    // the browser's reason is usually the more useful one (timeouts, DNS)
    throw new CaptureError(withHint(browserError ?? (err instanceof Error ? err.message : String(err))));
  }
}

export async function runAudit(req: AuditRequest, send: SSESend, signal: AbortSignal): Promise<void> {
  const task = (id: TaskId, status: TaskStatus, meta?: string, details?: TaskDetail[]) =>
    send("task", { id, label: TASK_LABELS[id], status, meta, details } satisfies TaskEvent);
  for (const id of TASK_ORDER) task(id, "queued");

  const pinned = req.siteType && req.siteType !== "auto" ? req.siteType : null;
  const ctaFor = (html: string) => {
    const detected = detectSiteType(pageText(load(html)).toLowerCase()).type;
    return ctaTexts(getDynamicKeywords(pinned ?? detected));
  };

  /* 1. capture */
  task("capture", "running", "Opening the page");
  let captured: Captured;
  let pageUrl: string;
  let note: string | undefined;
  try {
    const sample = sampleIdOf(req.url);
    if (sample) {
      const meta = SAMPLES[sample];
      const html = await readFile(path.join(process.cwd(), "public", "reviewer", "samples", meta.file), "utf8");
      const t0 = Date.now();
      try {
        captured = await capturePage({ kind: "html", html, url: meta.url }, { signal, ctaTexts: ctaFor });
      } catch (err) {
        if (signal.aborted) throw err;
        captured = rawCapture(html, meta.url, "sample", Date.now() - t0);
        note = "The headless browser isn't available, so this reads the sample's HTML without a screenshot.";
      }
      pageUrl = meta.url;
    } else {
      const res = await captureUrl(req.url, ctaFor, signal);
      captured = res.captured;
      note = res.note;
      pageUrl = captured.finalUrl;
    }
  } catch (err) {
    task("capture", "failed", "Couldn't load");
    throw err;
  }

  const jpeg = (b: Buffer | null) => (b ? `data:image/jpeg;base64,${b.toString("base64")}` : null);
  const src = jpeg(captured.screenshot);
  send("capture", {
    src,
    srcBelow: jpeg(captured.screenshotBelow),
    width: captured.width,
    height: captured.height,
    viewportHeight: captured.viewportHeight,
    pageHeight: captured.pageHeight,
    engine: captured.engine,
    url: req.url,
    finalUrl: pageUrl,
    title: captured.title,
    elapsedMs: captured.elapsedMs,
    note,
  } satisfies CaptureEvent);
  send("boxes", { boxes: captured.boxes });
  task(
    "capture",
    "done",
    captured.engine === "fetch" ? "HTML only" : captured.screenshot ? secs(captured.elapsedMs) : "HTML only",
    [
      { label: "Engine", meta: captured.screenshot ? `Chromium ${VIEWPORT.width}×${VIEWPORT.height}` : "fetch + cheerio" },
      { label: "Load time", meta: secs(captured.elapsedMs) },
      ...(captured.pageHeight ? [{ label: "Page height", meta: `${n(captured.pageHeight)}px` }] : []),
      { label: "Elements boxed", meta: n(captured.boxes.length) },
    ],
  );
  await sleep(220, signal);

  /* 2. classify */
  task("classify", "running", "Reading keywords");
  const result = runHeuristics(captured.html, { url: pageUrl, siteType: req.siteType ?? "auto", rendered: captured.rendered });
  const cls: ClassifyEvent = result.classification;
  await sleep(320, signal);
  send("page", result.facts);
  send("classify", cls);
  task("classify", "done", `${SITE_LABELS[cls.siteType]}, ${PAGE_LABELS[cls.pageType].toLowerCase()}`, [
    { label: "Ecommerce · SaaS · B2B hits", meta: `${cls.scores.ecommerce} · ${cls.scores.saas} · ${cls.scores.b2b}` },
    { label: "Product · Home · Category hits", meta: `${cls.pageScores.product} · ${cls.pageScores.homepage} · ${cls.pageScores.category}` },
    { label: "Confidence", meta: `${Math.round(cls.confidence * 100)}%` },
    ...(cls.pageReason ? [{ label: "Page type from", meta: cls.pageReason }] : []),
  ]);

  /* 3. checks */
  const total = result.signals.length;
  task("checks", "running", `0/${total}`);
  for (let i = 0; i < total; i += 1) {
    send("signal", { signal: result.signals[i] });
    if ((i + 1) % 3 === 0 || i === total - 1) task("checks", "running", `${i + 1}/${total}`);
    await sleep(SIGNAL_GAP_MS, signal);
  }
  const counts = statusCounts(result.signals);
  task("checks", "done", `${total} checks`, [
    { label: "Passed", meta: String(counts.pass) },
    { label: "Warnings", meta: String(counts.warn) },
    { label: "Failed", meta: String(counts.fail) },
  ]);

  /* 4. score */
  task("score", "running", "Weighting categories");
  const score = scoreSignals(result.signals, cls.siteType, cls.pageType);
  await sleep(300, signal);
  send("scores", { ...score, legacy: result.legacy } satisfies ScoresEvent);
  task("score", "done", `${Math.round(score.overall)}/100`, [
    { label: "Weights for", meta: `${SITE_LABELS[cls.siteType]}, ${PAGE_LABELS[cls.pageType].toLowerCase()}` },
    { label: "Original formula", meta: `${result.legacy.overall_score.toFixed(1)}/10` },
  ]);

  /* 5. report */
  const live = hasLLM();
  task("report", "running", live ? "Asking the model" : "Writing from the checks");
  const recs = await recommend(
    { url: pageUrl, signals: result.signals, facts: result.facts, site: cls.siteType, page: cls.pageType, score, rendered: !!captured.rendered },
    { signal },
  );
  if (recs.source === "rules") await sleep(520, signal);
  send("recommendations", recs);
  task("report", "done", `${recs.items.length} ${recs.items.length === 1 ? "fix" : "fixes"}`, [
    { label: "Written by", meta: recs.source === "llm" ? (recs.model ?? "Groq") : "Rules" },
  ]);
}
