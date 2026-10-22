import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Box, CaptureEngine } from "./types";
import type { RenderedFacts } from "./heuristics/extras";
import { CTA_EXCLUDE } from "./heuristics/port";

/* ─────────────────────────────────────────────────────────
 * CAPTURE — Playwright renders the page so the audit sees
 * what a visitor sees: JS-built markup, real positions, and
 * popups that actually cover the screen.
 *
 *  - one browser per server, reused; closes after 60s idle
 *  - viewport 1440×900, goto with a 20s budget
 *  - returns rendered HTML, a JPEG of the top of the page
 *    (up to 3 screens) and element boxes for the X-ray lens
 *  - every request passes the SSRF guard; samples get no
 *    network at all
 * If the browser can't do it, fetchHtml() is the fallback.
 * ───────────────────────────────────────────────────────── */

export const VIEWPORT = { width: 1440, height: 900 } as const;
export const MAX_CAPTURE_HEIGHT = 2700;
const NAV_TIMEOUT = 20_000;
const IDLE_CLOSE_MS = 60_000;
const MAX_HTML = 6_000_000;

export const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export class CaptureError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "CaptureError";
    this.status = status;
  }
}

export type Captured = {
  html: string;
  finalUrl: string;
  title: string;
  /** the first screen (viewport) */
  screenshot: Buffer | null;
  /** the page below the fold, up to MAX_CAPTURE_HEIGHT */
  screenshotBelow: Buffer | null;
  width: number;
  height: number;
  pageHeight: number;
  viewportHeight: number;
  boxes: Box[];
  rendered: RenderedFacts | null;
  engine: CaptureEngine;
  elapsedMs: number;
  status?: number;
  redirectsBlocked?: number;
};

type CaptureTarget = { kind: "url"; url: URL } | { kind: "html"; html: string; url: string };

export type CaptureOptions = {
  signal?: AbortSignal;
  /** CTA phrases in priority order, derived from the page's own HTML */
  ctaTexts: (html: string) => string[];
  /** returns false for any URL that must not be requested */
  guard?: (url: string) => Promise<boolean>;
};

/* ── browser pool (survives dev hot reloads via globalThis) ── */

type Pool = { browser: Promise<Browser> | null; active: number; timer: ReturnType<typeof setTimeout> | null };
const g = globalThis as unknown as { __reviewerPool?: Pool };
const pool: Pool = (g.__reviewerPool ??= { browser: null, active: 0, timer: null });

async function acquire(): Promise<Browser> {
  if (pool.timer) {
    clearTimeout(pool.timer);
    pool.timer = null;
  }
  pool.active += 1;
  try {
    if (!pool.browser) pool.browser = chromium.launch({ headless: true });
    let browser = await pool.browser;
    if (!browser.isConnected()) {
      pool.browser = chromium.launch({ headless: true });
      browser = await pool.browser;
    }
    return browser;
  } catch (err) {
    pool.browser = null;
    pool.active = Math.max(0, pool.active - 1);
    throw err;
  }
}

function release() {
  pool.active = Math.max(0, pool.active - 1);
  if (pool.active > 0) return;
  pool.timer = setTimeout(() => {
    const p = pool.browser;
    pool.browser = null;
    pool.timer = null;
    p?.then((b) => b.close()).catch(() => {});
  }, IDLE_CLOSE_MS);
  pool.timer.unref?.();
}

/** Closes the shared browser now (tests, shutdown). */
export async function shutdownCapture(): Promise<void> {
  if (pool.timer) clearTimeout(pool.timer);
  pool.timer = null;
  const p = pool.browser;
  pool.browser = null;
  await p?.then((b) => b.close()).catch(() => {});
}

/* ── in-page measurement ─────────────────────────────── */

type Measured = {
  boxes: Box[];
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  title: string;
};

/**
 * Runs inside the page. Kept as a string so no bundler helper can leak
 * into it. Finds the elements the heuristics care about and returns
 * their boxes in document (capture) pixels.
 */
export function boxScript(ctaTexts: string[], maxHeight = MAX_CAPTURE_HEIGHT): string {
  return `(() => {
  const CTA = ${JSON.stringify(ctaTexts)};
  const EXCLUDE = ${JSON.stringify(CTA_EXCLUDE)};
  const MAXH = ${maxHeight};
  const vw = window.innerWidth, vh = window.innerHeight;
  const de = document.documentElement;
  const pageHeight = Math.max(de.scrollHeight, document.body ? document.body.scrollHeight : 0);
  // read live: a page that scrolls itself mid-measure must not skew the boxes
  let sx = window.scrollX, sy = window.scrollY;
  const sync = () => { sx = window.scrollX; sy = window.scrollY; };
  const norm = (s) => (s || "").replace(/\\s+/g, " ").trim();
  const boxes = [];
  const count = (k) => boxes.filter((b) => b.kind === k).length;
  const styleOk = (el) => {
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) >= 0.05;
  };
  const toBox = (r) => {
    sync();
    const x = Math.max(0, r.left + sx), y = Math.max(0, r.top + sy);
    const w = Math.min(r.right + sx, vw) - x, h = Math.min(r.bottom + sy, MAXH) - y;
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  };
  const usable = (el) => {
    sync();
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    if (r.bottom + sy <= 0 || r.top + sy >= MAXH || r.right <= 0 || r.left >= vw) return null;
    if (!styleOk(el)) return null;
    const b = toBox(r);
    return b.w >= 4 && b.h >= 4 ? b : null;
  };
  const overlap = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  const add = (kind, label, box, text, extra) => {
    if (boxes.some((o) => o.kind === kind && overlap(o, box))) return false;
    boxes.push(Object.assign({ kind, label }, box, text ? { text: norm(text).slice(0, 60) } : {}, extra || {}));
    return true;
  };
  const innermost = (els) => els.filter((el) => !els.some((o) => o !== el && el.contains(o)));

  // CTAs, in the heuristics' keyword order so the first is the same primary CTA
  const clickables = Array.from(document.querySelectorAll("button, a, input[type=submit], input[type=button], [role=button], [onclick]"));
  const labelOf = (el) => norm(el.getAttribute("value") || el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.textContent).toLowerCase();
  const labels = new Map(clickables.map((el) => [el, labelOf(el)]));
  let primary = true;
  for (const t of CTA) {
    for (const el of clickables) {
      if (count("cta") >= 4) break;
      const label = labels.get(el);
      if (!label || label.length > 60 || !label.includes(t)) continue;
      if (EXCLUDE.some((p) => label.includes(p))) continue;
      const box = usable(el);
      if (!box) continue;
      if (add("cta", "CTA", box, el.innerText || el.getAttribute("aria-label") || el.value, primary ? { primary: true } : undefined)) primary = false;
    }
  }

  // size-gated stores show "Select a size" in the button's slot until a variant is picked
  if (count("cta") === 0 || !boxes.some((b) => b.primary)) {
    const GATED = /^(select|choose|pick) (a |an |your )?(size|color|colour|option|variant|style|fit)s?$/i;
    for (const el of Array.from(document.querySelectorAll("button, [role=button], input[type=submit]"))) {
      const label = labels.get(el) || labelOf(el);
      if (!GATED.test(label)) continue;
      const box = usable(el);
      if (box && add("cta", "CTA", box, el.innerText || label, { primary: true })) break;
    }
  }

  // prices: price-named elements first, then any currency text
  const PRICE = /[$£€¥₹]\\s?\\d[\\d,]*(\\.\\d{2})?|\\d[\\d,]*(\\.\\d{2})?\\s?(USD|EUR|GBP|CAD|AUD)\\b/;
  const named = innermost(Array.from(document.querySelectorAll('[class*="price" i], [id*="price" i], [itemprop="price"], [data-price]'))
    .filter((el) => { const t = norm(el.textContent); return t.length <= 40 && PRICE.test(t); }));
  for (const el of named) { if (count("price") >= 3) break; const b = usable(el); if (b) add("price", "Price", b, el.textContent); }
  if (count("price") === 0 && document.body) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode()) && count("price") < 3) {
      const t = n.nodeValue || "";
      if (!PRICE.test(t) || t.length > 60 || /shipping|delivery|orders? over|% off|save/i.test(t)) continue;
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(p.tagName) || !styleOk(p)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom + sy <= 0 || r.top + sy >= MAXH || r.right <= 0 || r.left >= vw) continue;
      const b = toBox(r);
      if (b.w >= 4 && b.h >= 4) add("price", "Price", b, t);
    }
  }

  // trust: guarantees, returns, shipping promises, security notes, badges
  const TRUST = /guarantee|warranty|money.back|free (shipping|returns|delivery)|\\d+[- ]day (returns?|trial|guarantee)|\\breturns?\\b|refund|secure (checkout|payment)|\\bssl\\b|encrypted|certified/i;
  const trust = innermost(Array.from(document.querySelectorAll("li, p, span, small, strong, a, div, [class*=badge i], [class*=trust i], [class*=guarantee i]"))
    .filter((el) => { const t = norm(el.textContent); return t.length > 3 && t.length <= 90 && TRUST.test(t); }));
  for (const el of trust) { if (count("trust") >= 5) break; const b = usable(el); if (b) add("trust", "Trust", b, el.textContent); }

  // reviews: compact rating near the title first, then the reviews section
  const REV = /★|\\d(\\.\\d)?\\s*(out of|\\/)\\s*5|\\d[\\d,]*\\s+(reviews|ratings)|\\breviews?\\b/i;
  const rev = Array.from(document.querySelectorAll('[class*="rating" i], [class*="review" i], [class*="stars" i], [aria-label*="rating" i], [aria-label*="out of 5" i], [itemprop="aggregateRating"], section[id*="review" i]'))
    .filter((el) => REV.test((el.textContent || "") + " " + (el.getAttribute("aria-label") || "")));
  const compact = innermost(rev.filter((el) => el.getBoundingClientRect().height < 140));
  for (const el of compact) { if (count("reviews") >= 2) break; const b = usable(el); if (b) add("reviews", "Reviews", b, el.textContent); }
  const large = rev.filter((el) => el.getBoundingClientRect().height >= 140);
  const outer = large.filter((el) => !large.some((o) => o !== el && o.contains(el)));
  for (const el of outer) { const b = usable(el); if (b && add("reviews", "Reviews", b, "")) break; }

  // hero: the largest image in the first screen
  let hero = null, heroArea = 0;
  for (const el of Array.from(document.querySelectorAll("img, picture, video, canvas, svg"))) {
    const r = el.getBoundingClientRect();
    if (r.top + sy >= vh || r.width < 40 || r.height < 40) continue;
    const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    if (h <= 0 || !styleOk(el)) continue;
    const area = r.width * h;
    if (area > heroArea) { heroArea = area; hero = el; }
  }
  if (hero && heroArea >= vw * vh * 0.02) { const b = usable(hero); if (b) add("hero", "Hero image", b, hero.getAttribute("alt") || ""); }

  // the first visible H1
  for (const el of Array.from(document.querySelectorAll("h1"))) { const b = usable(el); if (b) { add("h1", "H1", b, el.innerText); break; } }

  // forms
  for (const f of Array.from(document.querySelectorAll("form"))) {
    if (count("form") >= 4) break;
    const b = usable(f);
    if (!b || b.w * b.h < 1500) continue;
    const label = f.querySelector('input[type=search]') || f.getAttribute("role") === "search" ? "Search" : f.querySelector('input[type=email], input[name*="mail" i]') ? "Signup form" : "Form";
    add("form", label, b, "");
  }

  return { boxes, pageHeight, viewportWidth: vw, viewportHeight: vh, title: document.title };
})()`;
}

type Overlay = { coverage: number; text: string; locked: boolean };

/**
 * What covers the first screen on load: the largest visible fixed layer
 * (painted, a dialog, or blurred backdrop) and whether the page has locked
 * scrolling behind it. Measured before any cleanup, so it reports what a
 * visitor actually meets.
 */
const OVERLAY_SCRIPT = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const norm = (s) => (s || "").replace(/\\s+/g, " ").trim();
  let coverage = 0, text = "";
  const all = document.body ? document.body.getElementsByTagName("*") : [];
  for (let i = 0; i < all.length && i < 8000; i++) {
    const el = all[i];
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.1) continue;
    if (el === document.body) continue;
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const cov = (w * h) / (vw * vh);
    if (cov < 0.25 || cov <= coverage) continue;
    const bg = cs.backgroundColor;
    const painted = bg && bg !== "transparent" && !/rgba\\([^)]*,\\s*0\\)$/.test(bg);
    const dialog = el.matches("[role=dialog], [aria-modal=true]") || !!el.querySelector("[role=dialog], [aria-modal=true]");
    if (!painted && !dialog && cs.backdropFilter === "none") continue;
    coverage = cov;
    text = norm(el.innerText).slice(0, 60);
  }
  const hs = getComputedStyle(document.documentElement), bs = document.body ? getComputedStyle(document.body) : hs;
  const locked = hs.overflowY === "hidden" || bs.overflowY === "hidden" || bs.position === "fixed";
  return { coverage: Math.round(coverage * 100) / 100, text, locked };
})()`;

/**
 * Only for scroll-locked pages: a modal froze the page (often at a scrolled
 * offset), which would leave the capture blank below the first screen. Undo
 * the lock and hide the covering layers so the elements can be measured.
 */
const UNLOCK_SCRIPT = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  for (const el of [document.documentElement, document.body]) {
    if (!el) continue;
    el.style.setProperty("overflow", "visible", "important");
    el.style.setProperty("position", "static", "important");
    el.style.setProperty("top", "auto", "important");
  }
  const all = document.body ? document.body.getElementsByTagName("*") : [];
  for (let i = 0; i < all.length && i < 8000; i++) {
    const el = all[i];
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    if ((w * h) / (vw * vh) >= 0.25) el.style.setProperty("display", "none", "important");
  }
  document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
})()`;

/* ── capture ─────────────────────────────────────────── */

/**
 * Holds the page at the top while we measure and shoot. Some pages scroll
 * themselves after load (a focused third-party iframe, scroll restoration),
 * which would misalign the boxes with the screenshot.
 */
const PIN_TOP_SCRIPT = `(() => {
  document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
  const pin = () => { if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo({ top: 0, left: 0, behavior: "instant" }); };
  window.addEventListener("scroll", pin, { passive: true });
  pin();
})()`;

const HIDE_FIXED_SCRIPT = `(() => {
  const all = document.body ? document.body.getElementsByTagName("*") : [];
  for (let i = 0; i < all.length && i < 8000; i++) {
    if (getComputedStyle(all[i]).position === "fixed") all[i].style.setProperty("visibility", "hidden", "important");
  }
})()`;

/** Scrolls through the top of the page so lazy images load, then snaps back. */
const SETTLE_SCRIPT = `(async () => {
  document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
  const h = Math.min(document.documentElement.scrollHeight, ${MAX_CAPTURE_HEIGHT});
  for (let y = 0; y < h; y += 700) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 110)); }
  window.scrollTo({ top: 0, behavior: "instant" });
})()`;

function describe(err: unknown): CaptureError {
  if (err instanceof CaptureError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || /Timeout \d+ms exceeded/i.test(msg)) return new CaptureError("Couldn't load that page: timed out after 20s.");
  if (/ERR_NAME_NOT_RESOLVED/.test(msg)) return new CaptureError("Couldn't find that site. Check the address.");
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/.test(msg)) return new CaptureError("The site refused the connection.");
  if (/ERR_CERT|SSL/.test(msg)) return new CaptureError("The site's HTTPS certificate is broken.");
  if (/ERR_BLOCKED_BY_CLIENT/.test(msg)) return new CaptureError("That address points to a private network, so it's blocked.");
  if (/ERR_ABORTED|Download is starting/.test(msg)) return new CaptureError("That link didn't open as a web page.");
  if (/Executable doesn't exist|browserType\.launch/i.test(msg)) return new CaptureError("The headless browser isn't available here.");
  return new CaptureError(`Couldn't load that page: ${msg.split("\n")[0].slice(0, 120)}`);
}

export async function capturePage(target: CaptureTarget, opts: CaptureOptions): Promise<Captured> {
  const started = Date.now();
  if (opts.signal?.aborted) throw new CaptureError("Cancelled.");
  const browser = await acquire().catch((err) => {
    throw describe(err);
  });
  let context: BrowserContext | null = null;
  let navigationRedirect = false;
  let redirectsBlocked = 0;
  const onAbort = () => {
    context?.close().catch(() => {});
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      userAgent: DESKTOP_UA,
      locale: "en-US",
      colorScheme: "light",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.routeWebSocket("**/*", socket => socket.close());
    await context.route("**/*", async (route) => {
      const req = route.request();
      const u = req.url();
      if (u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
      if (target.kind === "html") return route.abort(); // samples are self-contained
      if (req.resourceType() === "media") return route.abort();
      if (opts.guard && !(await opts.guard(u))) return route.abort("blockedbyclient");
      // Chromium follows redirects without rerunning route handlers. Fetch only
      // this hop and reject redirects before fulfilling the browser request.
      // The pipeline can still follow validated redirects through fetchHtml().
      try {
        const response = await route.fetch({ maxRedirects: 0, timeout: NAV_TIMEOUT });
        if (response.status() >= 300 && response.status() < 400 && response.headers()["location"]) {
          redirectsBlocked += 1;
          if (req.isNavigationRequest()) navigationRedirect = true;
          await response.dispose();
          return route.abort("blockedbyclient");
        }
        await route.fulfill({ response });
        await response.dispose();
      } catch {
        await route.abort().catch(() => {});
      }
    });

    const page: Page = await context.newPage();
    let status: number | undefined;

    if (target.kind === "html") {
      await page.setContent(target.html, { waitUntil: "load", timeout: 10_000 });
    } else {
      const res = await page.goto(target.url.href, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      status = res?.status();
      await page.waitForLoadState("load", { timeout: 8000 }).catch(() => {});
      await page.evaluate(SETTLE_SCRIPT).catch(() => {});
      await page.waitForTimeout(450);
      if (opts.guard && !(await opts.guard(page.url()))) throw new CaptureError("That address points to a private network, so it's blocked.");
    }

    let html = await page.content();
    if (html.length > MAX_HTML) html = html.slice(0, MAX_HTML);
    const overlay = (await page.evaluate(OVERLAY_SCRIPT)) as Overlay;
    if (overlay.locked) {
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(250);
      await page.evaluate(UNLOCK_SCRIPT).catch(() => {});
      await page.waitForTimeout(250);
    }
    await page.evaluate(PIN_TOP_SCRIPT).catch(() => {});
    await page.waitForTimeout(60);
    const measured = (await page.evaluate(boxScript(opts.ctaTexts(html)))) as Measured;

    // the first screen exactly as a visitor sees it
    const screenshot = await page.screenshot({ type: "jpeg", quality: 68, timeout: 15_000, animations: "disabled" });
    // the rest separately, with fixed layers hidden: full-page capture fires a
    // resize, and some sites answer it by moving their fixed header mid-page
    let screenshotBelow: Buffer | null = null;
    const total = Math.min(measured.pageHeight, MAX_CAPTURE_HEIGHT);
    if (total > VIEWPORT.height + 40) {
      await page.evaluate(HIDE_FIXED_SCRIPT).catch(() => {});
      screenshotBelow = await page
        .screenshot({
          type: "jpeg",
          quality: 64,
          fullPage: true,
          clip: { x: 0, y: VIEWPORT.height, width: VIEWPORT.width, height: total - VIEWPORT.height },
          timeout: 15_000,
          animations: "disabled",
        })
        .catch(() => null);
    }
    const height = screenshotBelow ? total : VIEWPORT.height;

    return {
      html,
      finalUrl: target.kind === "html" ? target.url : page.url(),
      title: measured.title,
      screenshot,
      screenshotBelow,
      width: VIEWPORT.width,
      height,
      pageHeight: measured.pageHeight,
      viewportHeight: measured.viewportHeight,
      boxes: measured.boxes,
      rendered: {
        viewportWidth: measured.viewportWidth,
        viewportHeight: measured.viewportHeight,
        pageHeight: measured.pageHeight,
        overlayCoverage: overlay.coverage,
        overlayText: overlay.text || undefined,
        boxes: measured.boxes,
      },
      engine: target.kind === "html" ? "sample" : "playwright",
      elapsedMs: Date.now() - started,
      status,
      redirectsBlocked,
    };
  } catch (err) {
    if (opts.signal?.aborted) throw new CaptureError("Cancelled.");
    if (navigationRedirect) throw new CaptureError("The page redirected, so browser capture was blocked. Paste the final page URL for a screenshot.");
    throw describe(err);
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
    await context?.close().catch(() => {});
    release();
  }
}

/* ── fallback: plain fetch, redirects checked hop by hop ── */

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function fetchHtml(
  url: URL,
  opts: { signal?: AbortSignal; guard: (u: string) => Promise<boolean> },
): Promise<{ html: string; finalUrl: string; status: number; elapsedMs: number }> {
  const started = Date.now();
  let current = url.href;
  for (let hop = 0; hop < 6; hop += 1) {
    if (!(await opts.guard(current))) throw new CaptureError("That address points to a private network, so it's blocked.");
    const signals = [AbortSignal.timeout(12_000), ...(opts.signal ? [opts.signal] : [])];
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: {
          "User-Agent": DESKTOP_UA,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.any(signals),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError") throw new CaptureError("Couldn't load that page: timed out after 12s.");
      throw new CaptureError(`Couldn't load that page: ${err instanceof Error ? err.message : String(err)}`);
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    if (!res.ok) throw new CaptureError(`The site answered ${res.status}.`, res.status);
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) throw new CaptureError("That link isn't an HTML page.");
    const html = await readCapped(res, MAX_HTML);
    return { html, finalUrl: current, status: res.status, elapsedMs: Date.now() - started };
  }
  throw new CaptureError("Too many redirects.");
}

/** Bot walls and challenge pages: auditing them would score the wall. */
export function looksBlocked(title: string, status?: number): boolean {
  if (status && status >= 400) return true;
  return /just a moment|attention required|access denied|are you a robot|verify you are human|captcha|request blocked|pardon our interruption/i.test(title);
}
