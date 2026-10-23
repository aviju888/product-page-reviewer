import { z } from "zod";
import { completeJSON, hasLLM, MODELS } from "@/lib/llm";
import { CATEGORY_LABELS, PAGE_LABELS, signalImpact, signalWeight, SITE_LABELS, type SignalImpact } from "./score";
import { summarize } from "./summary";
import type { Impact, PageFacts, PageType, Recommendation, RecommendationsEvent, ScoreResult, Signal, SiteType } from "./types";

/* ─────────────────────────────────────────────────────────
 * RECOMMENDATIONS
 *  - live: Groq with llm.py's CRO-specialist prompt, JSON out,
 *    validated; every item must cite failing signal ids.
 *  - demo: deterministic rules over this page's failing and
 *    warning signals, written from their evidence.
 * Both rank by points at stake: what each fix would add to
 * the overall score if the cited checks passed.
 * ───────────────────────────────────────────────────────── */

export type RecommendInput = {
  url: string;
  signals: Signal[];
  facts: PageFacts;
  site: SiteType;
  page: PageType;
  score: ScoreResult;
  /** positions came from a real render (higher confidence for layout fixes) */
  rendered: boolean;
};

type Ctx = RecommendInput & { impact: Record<string, SignalImpact> };
type Built = { title: string; detail: string; confidence: number };
type Rule = { id: string; signals: string[]; build: (c: Ctx, failing: Signal[]) => Built | null };

const MAX_ITEMS = 6;

function clip(s: string, max = 28): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
const btn = (c: Ctx) => (c.facts.cta ? `“${clip(c.facts.cta, 24)}”` : "the button");
const find = (f: Signal[], id: string) => f.find((s) => s.id === id);
const has = (f: Signal[], id: string) => f.some((s) => s.id === id);
const ev = (s?: Signal) => (s?.evidence ? s.evidence.replace(/\.$/, "") : "");
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function list(parts: string[], joiner: "and" | "or" = "and"): string {
  const p = parts.filter(Boolean);
  if (p.length <= 1) return p.join("");
  return `${p.slice(0, -1).join(", ")} ${joiner} ${p[p.length - 1]}`;
}

const RULES: Rule[] = [
  {
    id: "add-cta",
    signals: ["cta-found"],
    build: () => ({
      title: "Add a clear primary button",
      detail: "No buy or signup button was found. Give the page one obvious action, like “Add to cart”, right beside the price.",
      confidence: 0.85,
    }),
  },
  {
    id: "cta-fold",
    signals: ["cta-above-fold"],
    build: (c, f) => {
      if (!c.facts.cta) return null;
      return {
        title: `Bring ${btn(c)} into the first screen`,
        detail: `${sentence(ev(f[0]))}. Most visitors decide before they scroll, so put the button beside the name and price.`,
        confidence: c.rendered ? 0.9 : 0.6,
      };
    },
  },
  {
    id: "cta-label",
    signals: ["cta-specific-label", "cta-real-button", "cta-grouped", "cta-competing", "cta-label-length"],
    build: (c, f) => {
      if (!c.facts.cta) return null;
      if (has(f, "cta-real-button"))
        return {
          title: `Make ${btn(c)} a real button`,
          detail: "It's a clickable div, so keyboards and screen readers can't reach it. Use a <button> element with the same look.",
          confidence: 0.85,
        };
      if (has(f, "cta-specific-label"))
        return {
          title: `Rename ${btn(c)}`,
          detail: `${sentence(ev(find(f, "cta-specific-label")))}. Name the outcome instead: “Add to cart”, “Start free trial”, “Book a demo”.`,
          confidence: 0.7,
        };
      if (has(f, "cta-grouped"))
        return {
          title: "Group the name, price and button",
          detail: "The button sits apart from the price and product name. One buy box lets people decide without hunting.",
          confidence: 0.65,
        };
      if (has(f, "cta-competing"))
        return {
          title: "Pick one primary action",
          detail: `${sentence(ev(find(f, "cta-competing")))}. Keep one filled button and make the rest quiet links.`,
          confidence: 0.6,
        };
      return { title: "Shorten the button label", detail: `${sentence(ev(f[0]))}. Four words or fewer reads at a glance.`, confidence: 0.6 };
    },
  },
  {
    id: "price",
    signals: ["price-found", "price-near-cta", "price-currency"],
    build: (c, f) => {
      if (has(f, "price-found") && !c.facts.price)
        return {
          title: "Show the price",
          detail: `There's no price on the page. Put it right above ${btn(c)} so people don't leave to look it up.`,
          confidence: 0.9,
        };
      if (has(f, "price-near-cta") && c.facts.price)
        return {
          title: `Move the price next to ${btn(c)}`,
          detail: `${clip(c.facts.price, 20)} is on the page but far from the button. People decide at the button, so show the cost there.`,
          confidence: 0.75,
        };
      return { title: "Make the price unmistakable", detail: `${sentence(ev(f[0]))}. Show the amount with its currency in the buy box.`, confidence: 0.7 };
    },
  },
  {
    id: "reassure",
    signals: ["cta-delivery", "price-shipping-cost", "trust-returns", "trust-guarantee"],
    build: (c, f) => {
      const missing = [
        has(f, "price-shipping-cost") ? "shipping cost" : "",
        has(f, "trust-returns") ? "return window" : "",
        has(f, "trust-guarantee") ? "guarantee" : "",
      ].filter(Boolean);
      if (missing.length === 0)
        return {
          title: `Repeat shipping and returns under ${btn(c)}`,
          detail: "The page mentions them, but not where people decide. Add one line under the button with delivery time and return window.",
          confidence: 0.7,
        };
      return {
        title: "Answer the risk questions by the button",
        detail: `No ${list(missing, "or")} on the page. One line under ${btn(c)} settles the doubts that stall checkout.`,
        confidence: 0.8,
      };
    },
  },
  {
    id: "reviews",
    signals: ["proof-reviews", "proof-review-count", "proof-rating", "proof-rating-near-title"],
    build: (c, f) => {
      if (has(f, "proof-reviews"))
        return {
          title: "Add reviews and a star rating",
          detail: "There are no reviews or ratings on the page. Show the average rating under the product name and a few real reviews further down.",
          confidence: 0.85,
        };
      if (has(f, "proof-review-count"))
        return {
          title: "Collect more reviews",
          detail: `${sentence(ev(find(f, "proof-review-count")))}. A handful reads as thin, so ask recent buyers for one.`,
          confidence: 0.7,
        };
      if (has(f, "proof-rating"))
        return {
          title: "Show the rating as a number",
          detail: `${sentence(ev(find(f, "proof-rating")))}. Write it as stars plus “4.6 out of 5” and mark it up as AggregateRating.`,
          confidence: 0.65,
        };
      return {
        title: "Put the stars under the product name",
        detail: "Reviews exist but sit far from the name. Show the rating and review count right under the H1.",
        confidence: 0.7,
      };
    },
  },
  {
    id: "popup",
    signals: ["mobile-no-popups", "cta-no-modal"],
    build: (c, f) => {
      const cover = find(f, "mobile-no-popups");
      if (cover)
        return {
          title: "Hold the popup until people scroll",
          detail: `${sentence(ev(cover))}. It hides the product before anyone sees it. Trigger it on scroll or exit intent instead.`,
          confidence: c.rendered ? 0.9 : 0.6,
        };
      return {
        title: "Keep actions out of popups",
        detail: "A popup carries its own signup button. Put the main action on the page and keep popups for later.",
        confidence: 0.6,
      };
    },
  },
  {
    id: "alt",
    signals: ["a11y-alt"],
    build: (c, f) => ({
      title: "Describe every product image",
      detail: `${sentence(ev(f[0]))}. Alt text is what screen readers announce and what image search indexes.`,
      confidence: 0.9,
    }),
  },
  {
    id: "forms",
    signals: ["a11y-form-labels", "mobile-input-types", "cta-forms"],
    build: (c, f) => {
      const labels = find(f, "a11y-form-labels");
      const types = find(f, "mobile-input-types");
      const forms = find(f, "cta-forms");
      if (!labels && !types && forms)
        return { title: "Cut the extra forms", detail: `${sentence(ev(forms))} on one page. Each one pulls focus from buying.`, confidence: 0.6 };
      const parts = [labels ? ev(labels) : "", types ? lowerFirst(ev(types)) : ""].filter(Boolean);
      return {
        title: "Label every form field",
        detail: `${sentence(parts.join(", "))}. Placeholders vanish as people type${types ? ", and type=\"email\" brings up the right keyboard" : ""}.`,
        confidence: 0.8,
      };
    },
  },
  {
    id: "heading",
    signals: ["content-h1", "content-single-h1", "content-subheadings", "a11y-heading-order"],
    build: (c, f) => {
      if (has(f, "content-h1"))
        return {
          title: "Make the product name the H1",
          detail: `${sentence(ev(find(f, "content-h1")))}. Search and screen readers treat the H1 as the page's name.`,
          confidence: 0.75,
        };
      if (has(f, "content-single-h1"))
        return {
          title: "Keep one H1",
          detail: `${sentence(ev(find(f, "content-single-h1")))}. Keep the product name as the only H1 and make the rest H2s.`,
          confidence: 0.75,
        };
      if (has(f, "content-subheadings"))
        return {
          title: "Break the page up with subheadings",
          detail: "There are no H2 or H3 headings. Short ones like Details, Reviews and FAQ make the page scannable.",
          confidence: 0.7,
        };
      return { title: "Fix the heading order", detail: `${sentence(ev(f[0]))}. Step down one level at a time.`, confidence: 0.6 };
    },
  },
  {
    id: "media",
    signals: ["media-images", "media-image-count", "media-gallery", "media-video", "media-hero"],
    build: (c, f) => {
      if (has(f, "media-images"))
        return c.site === "ecommerce"
          ? { title: "Add product photos", detail: "The page has no images. Show the product from the front, up close and in use.", confidence: 0.9 }
          : {
              title: "Show the product",
              detail: "The page has no images. Add a screenshot or a short clip of the product in use, so people can see what they're paying for.",
              confidence: 0.85,
            };
      if (f.length === 1 && has(f, "media-video"))
        return {
          title: "Add a short product video",
          detail: "No video on the page. Twenty seconds of the product in use answers what photos can't.",
          confidence: 0.6,
        };
      const parts = [
        has(f, "media-image-count") ? `only ${lowerFirst(ev(find(f, "media-image-count")))}` : "",
        has(f, "media-gallery") ? "no gallery" : "",
        has(f, "media-video") ? "no video" : "",
        has(f, "media-hero") ? `a main image that ${lowerFirst(ev(find(f, "media-hero")).replace(/^Main image /, ""))}` : "",
      ];
      return {
        title: "Show more of the product",
        detail: `${sentence(list(parts))}. Lead with one large photo, then front, detail and in-use shots in a gallery.`,
        confidence: 0.7,
      };
    },
  },
  {
    id: "copy",
    signals: ["content-description", "content-specs", "content-faq", "content-variants"],
    build: (c, f) => {
      const parts = [
        has(f, "content-description") ? lowerFirst(ev(find(f, "content-description"))) : "",
        has(f, "content-specs") ? "no specs" : "",
        has(f, "content-faq") ? "no FAQ" : "",
        has(f, "content-variants") ? "no visible size or color options" : "",
      ];
      return {
        title: "Answer questions on the page",
        detail: `${sentence(list(parts))}. Every unanswered question is a reason to leave and search.`,
        confidence: 0.65,
      };
    },
  },
  {
    id: "zoom",
    signals: ["mobile-viewport", "mobile-zoom", "mobile-responsive-images"],
    build: (c, f) => {
      if (has(f, "mobile-viewport"))
        return { title: "Add a mobile viewport tag", detail: "Without it, phones render a shrunken desktop page.", confidence: 0.9 };
      if (has(f, "mobile-zoom"))
        return {
          title: "Let people zoom",
          detail: "The viewport tag blocks pinch zoom, which locks out anyone who needs larger text. Remove user-scalable=no and maximum-scale.",
          confidence: 0.85,
        };
      return { title: "Serve phone-sized images", detail: `${sentence(ev(f[0]))}. Use srcset so phones skip desktop downloads.`, confidence: 0.6 };
    },
  },
  {
    id: "names",
    signals: ["a11y-buttons", "a11y-links", "a11y-lang", "a11y-main", "a11y-skip-link"],
    build: (c, f) => {
      const parts = [
        has(f, "a11y-buttons") ? lowerFirst(ev(find(f, "a11y-buttons"))) : "",
        has(f, "a11y-links") ? lowerFirst(ev(find(f, "a11y-links"))) : "",
        has(f, "a11y-lang") ? "no page language" : "",
      ].filter(Boolean);
      if (parts.length === 0)
        return { title: "Add landmarks and a skip link", detail: "A <main> landmark and a skip link let keyboard users jump past the header.", confidence: 0.6 };
      return {
        title: "Name icon buttons and links",
        detail: `${sentence(list(parts))}. Screen readers announce these as “button” or “link” with no hint of what they do.`,
        confidence: 0.8,
      };
    },
  },
  {
    id: "basics",
    signals: ["trust-https", "trust-contact", "trust-policies", "trust-about"],
    build: (c, f) => {
      if (has(f, "trust-https"))
        return {
          title: "Serve the page over HTTPS",
          detail: "It loads over plain HTTP, so browsers flag it as not secure, right next to your checkout.",
          confidence: 0.95,
        };
      const parts = [
        has(f, "trust-contact") ? "no contact link" : "",
        has(f, "trust-policies") ? "no privacy or terms pages" : "",
        has(f, "trust-about") ? "no about page" : "",
      ];
      return {
        title: "Show who's behind the store",
        detail: `${sentence(list(parts))}. People check these before they trust a new shop with a card.`,
        confidence: 0.7,
      };
    },
  },
  {
    id: "snippet",
    signals: ["tech-meta-title", "tech-meta-description", "tech-og", "tech-canonical"],
    build: (c, f) => {
      const parts = [
        has(f, "tech-meta-title") ? `title is ${lowerFirst(ev(find(f, "tech-meta-title")))}` : "",
        has(f, "tech-meta-description") ? (ev(find(f, "tech-meta-description")) === "Missing" ? "no meta description" : `meta description is ${ev(find(f, "tech-meta-description"))}`) : "",
        has(f, "tech-og") ? "no social preview tags" : "",
        has(f, "tech-canonical") ? "no canonical link" : "",
      ];
      return {
        title: "Fix the search snippet",
        detail: `${sentence(list(parts))}. That snippet is the first thing searchers see.`,
        confidence: 0.75,
      };
    },
  },
  {
    id: "schema",
    signals: ["tech-schema-product", "tech-schema-offer", "tech-schema-rating"],
    build: (c, f) => ({
      title: has(f, "tech-schema-product") ? "Add Product structured data" : "Complete the Product schema",
      detail: has(f, "tech-schema-product")
        ? "There's no Product schema, so search can't show the price or stars next to the result."
        : `${sentence(list(f.map((s) => lowerFirst(ev(s)))))}. Add them so results can show price and stars.`,
      confidence: 0.7,
    }),
  },
  {
    id: "weight",
    signals: ["tech-scripts", "tech-html-size", "tech-dom-depth", "tech-image-dimensions", "tech-lazy-images"],
    build: (c, f) => {
      const scripts = find(f, "tech-scripts");
      if (scripts)
        return {
          title: "Cut third-party scripts",
          detail: `${sentence(ev(scripts))}. Each one delays the page and the button. Drop the tags nobody reads.`,
          confidence: 0.7,
        };
      return {
        title: "Lighten the page",
        detail: `${sentence(list(f.map((s) => lowerFirst(ev(s)))))}. Lighter pages show the button sooner on phones.`,
        confidence: 0.6,
      };
    },
  },
  {
    id: "proof-extra",
    signals: ["proof-numbers", "proof-quotes", "proof-press", "proof-client-logos", "proof-case-studies"],
    build: (c, f) => {
      const parts = [
        has(f, "proof-numbers") ? "no customer counts" : "",
        has(f, "proof-quotes") ? "no quotes" : "",
        has(f, "proof-press") ? "no press" : "",
        has(f, "proof-client-logos") ? "no customer logos" : "",
        has(f, "proof-case-studies") ? "no case studies" : "",
      ];
      return {
        title: "Add proof beyond reviews",
        detail: `${sentence(list(parts))}. One concrete number or a named customer quote does more than adjectives.`,
        confidence: 0.6,
      };
    },
  },
  {
    id: "payments",
    signals: ["price-payment-options", "trust-security", "trust-badges", "trust-language"],
    build: (c, f) => {
      const parts = [
        has(f, "price-payment-options") ? "no wallets or pay later options" : "",
        has(f, "trust-security") ? "no payment or security marks" : "",
        has(f, "trust-badges") ? "no badges" : "",
        has(f, "trust-language") ? lowerFirst(ev(find(f, "trust-language"))) : "",
      ];
      return {
        title: "Show how people can pay",
        detail: `${sentence(list(parts))}. Familiar payment marks near checkout lower the risk of trying a new store.`,
        confidence: 0.65,
      };
    },
  },
  {
    id: "navigation",
    signals: ["content-breadcrumbs", "content-search", "content-related", "content-sections", "price-plans"],
    build: (c, f) => {
      if (f.length === 1 && has(f, "price-plans"))
        return { title: "Compare plans side by side", detail: `${sentence(ev(f[0]))}. A plan table answers “which one is for me”.`, confidence: 0.6 };
      const parts = [
        has(f, "content-breadcrumbs") ? "no breadcrumbs" : "",
        has(f, "content-search") ? "no search" : "",
        has(f, "content-related") ? "no related products" : "",
        has(f, "content-sections") ? "no sections" : "",
      ];
      return {
        title: "Help people find their way",
        detail: `${sentence(list(parts))}. Give people a next step besides the back button.`,
        confidence: 0.55,
      };
    },
  },
];

function impactFor(points: number): Impact {
  if (points >= 4) return "high";
  if (points >= 1.5) return "medium";
  return "low";
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function context(input: RecommendInput): Ctx {
  return { ...input, impact: signalImpact(input.signals, input.site, input.page) };
}

function failingOf(c: Ctx, ids: string[]): Signal[] {
  const byId = new Map(c.signals.map((s) => [s.id, s]));
  return ids
    .map((id) => byId.get(id))
    .filter((s): s is Signal => !!s && s.status !== "pass" && signalWeight(s, c.site, c.page) > 0);
}

function pointsOf(c: Ctx, signals: Signal[]): number {
  return signals.reduce((a, s) => a + (c.impact[s.id]?.lost ?? 0), 0);
}

export type RankedRecommendation = Recommendation & { points: number };
export type RankedRecommendations = Omit<RecommendationsEvent, "items"> & { items: RankedRecommendation[] };

/** Deterministic fixes for this page, ranked by points at stake. */
export function rulesRecommendations(input: RecommendInput): RankedRecommendation[] {
  const c = context(input);
  const out: RankedRecommendation[] = [];
  for (const rule of RULES) {
    const failing = failingOf(c, rule.signals);
    if (failing.length === 0) continue;
    // a missing button makes every other CTA fix moot
    if (rule.id !== "add-cta" && rule.id.startsWith("cta") && !c.facts.cta) continue;
    const built = rule.build(c, failing);
    if (!built) continue;
    const points = round1(pointsOf(c, failing));
    if (points < 0.2) continue;
    out.push({
      id: rule.id,
      title: built.title,
      detail: built.detail,
      impact: impactFor(points),
      signalIds: failing.map((s) => s.id),
      confidence: built.confidence,
      points,
    });
  }
  return out.sort((a, b) => b.points - a.points || b.confidence - a.confidence).slice(0, MAX_ITEMS);
}

export function recommendRules(input: RecommendInput): RankedRecommendations {
  const items = rulesRecommendations(input);
  return { items, summary: summarize(input, items[0]), source: "rules" };
}

export { summarize };

/* ── live: port of llm.py ─────────────────────────────── */

export function buildPrompt(input: RecommendInput): string {
  const failing = input.signals.filter((s) => s.status !== "pass" && signalWeight(s, input.site, input.page) > 0);
  const passing = input.signals.filter((s) => s.status === "pass").map((s) => s.id);
  const cats = input.score.categories
    .filter((c) => c.applicable > 0)
    .map((c) => `${c.id}=${Math.round(c.score)}`)
    .join(", ");
  const rows = failing.map((s) => `${s.id} | ${CATEGORY_LABELS[s.category]} | ${s.status} | ${s.evidence ?? ""}`).join("\n");

  return `You are a senior CRO & UX specialist with 10+ years of hands-on experience auditing product pages for e-commerce and SaaS businesses.
You excel at identifying friction points, diagnosing why users drop off, and prescribing practical fixes that measurably improve conversion.
Analyze the PRODUCT PAGE SIGNALS below and return STRICT JSON only.

PAGE: ${input.facts.title || "(no title)"} (${input.url})
SCORED AS: ${SITE_LABELS[input.site]} ${PAGE_LABELS[input.page].toLowerCase()}
FACTS: h1=${JSON.stringify(input.facts.h1)}, price=${JSON.stringify(input.facts.price)}, cta=${JSON.stringify(input.facts.cta)}, reviews=${input.facts.reviewCount}, rating=${input.facts.rating ?? "none"}

CONVERSION SCORES (already calculated, 0-100):
overall=${Math.round(input.score.overall)}; ${cats}

FAILING AND WARNING SIGNALS (id | category | status | evidence):
${rows || "(none)"}

PASSING SIGNALS (ids only): ${passing.join(", ")}

Your task is to provide actionable recommendations based on these scores and signals. Focus on:
1. Explaining WHY scores are low based on the specific signals
2. Providing concrete, implementable fixes
3. Prioritizing by conversion impact

RETURN JSON WITH EXACT KEYS:
{
  "summary": "1-2 sentence diagnosis focused on conversion risks and quick upside.",
  "items": [
    {
      "title": "imperative fix, under 8 words",
      "detail": "1-2 sentences: what to change and why, citing the evidence",
      "impact": "high" | "medium" | "low",
      "signal_ids": ["ids from the failing list"],
      "confidence": 1 | 2 | 3
    }
  ]
}

CONSTRAINTS:
- 3 to 6 items, most important first.
- Only include actions clearly justified by the failing or warning signals. Every item cites at least one id from that list.
- Never suggest fixing a passing signal.
- Use concise, plain words. No em dashes. No hype.
- Output ONLY valid JSON (no markdown, no prose).`;
}

const LlmSchema = z.object({
  summary: z.string().min(1).max(800),
  items: z.array(z.unknown()).min(1).max(12),
});

const LlmItem = z.object({
  title: z.string().min(2).max(140),
  detail: z.string().min(2).max(700),
  impact: z.enum(["high", "medium", "low"]).catch("medium"),
  signal_ids: z.array(z.string()).min(1),
  confidence: z.union([z.number(), z.string()]).optional(),
});

const dedash = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").trim();

/** Validates and grounds model output; throws when it can't be trusted. */
export function parseLlmRecommendations(raw: unknown, input: RecommendInput): RankedRecommendations {
  const parsed = LlmSchema.parse(raw);
  const c = context(input);
  const failingIds = new Set(failingOf(c, input.signals.map((s) => s.id)).map((s) => s.id));
  const items: RankedRecommendation[] = [];
  parsed.items.forEach((raw, i) => {
    // one malformed item shouldn't sink the rest
    const one = LlmItem.safeParse(raw);
    if (!one.success) return;
    const it = one.data;
    const ids = [...new Set(it.signal_ids)].filter((id) => failingIds.has(id));
    if (ids.length === 0) return;
    const conf = Number(it.confidence);
    const confidence = conf >= 3 ? 0.9 : conf >= 2 ? 0.75 : conf >= 1 ? 0.55 : 0.7;
    const points = round1(pointsOf(c, failingOf(c, ids)));
    items.push({ id: `llm-${i}`, title: dedash(it.title), detail: dedash(it.detail), impact: it.impact, signalIds: ids, confidence, points });
  });
  if (items.length < 2) throw new Error("Model output cited too few failing signals");
  return { items: items.slice(0, MAX_ITEMS), summary: dedash(parsed.summary), source: "llm", model: MODELS.deep };
}

export async function recommend(
  input: RecommendInput,
  opts: { signal?: AbortSignal } = {},
): Promise<RankedRecommendations> {
  if (hasLLM()) {
    try {
      const raw = await completeJSON<unknown>({
        messages: [{ role: "user", content: buildPrompt(input) }],
        model: "deep",
        temperature: 0.2,
        maxTokens: 1400,
        signal: opts.signal,
      });
      return parseLlmRecommendations(raw, input);
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      // fall back to the rules so the audit still finishes
    }
  }
  return recommendRules(input);
}
