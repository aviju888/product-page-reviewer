import {
  CATEGORY_IDS,
  type CategoryId,
  type CategoryScore,
  type PageType,
  type ScoreResult,
  type Signal,
  type SignalStatus,
  type SiteType,
} from "./types";

/* ─────────────────────────────────────────────────────────
 * SCORE — pure and isomorphic, so the client re-scores on
 * every type change or weight scrub without a round trip.
 *
 *   signal weight   = base (1..3) × site multiplier × page multiplier
 *   category score  = 100 × Σ(weight × credit) / Σ weight
 *                     credit: pass 1, warn 0.5, fail 0
 *   overall         = Σ(category score × category weight) / Σ weights
 *
 * Category weights start from the original's page-type weights
 * (product / homepage / other), mapped onto nine categories and
 * tilted per site type. Overrides come from the Fine-tune card.
 * ───────────────────────────────────────────────────────── */

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  cta: "Call to action",
  pricing: "Pricing",
  trust: "Trust",
  "social-proof": "Social proof",
  content: "Content",
  media: "Media",
  accessibility: "Accessibility",
  technical: "Technical",
  mobile: "Mobile",
};

export const CATEGORY_SHORT: Record<CategoryId, string> = {
  cta: "CTA",
  pricing: "Price",
  trust: "Trust",
  "social-proof": "Proof",
  content: "Content",
  media: "Media",
  accessibility: "A11y",
  technical: "Tech",
  mobile: "Mobile",
};

export const SITE_LABELS: Record<SiteType, string> = { ecommerce: "Ecommerce", saas: "SaaS", b2b: "B2B" };
/** for use mid-sentence: "an ecommerce page", "a SaaS page" */
export const SITE_NOUNS: Record<SiteType, string> = { ecommerce: "ecommerce", saas: "SaaS", b2b: "B2B" };
export const PAGE_LABELS: Record<PageType, string> = { product: "Product page", homepage: "Homepage", category: "Category page" };

/** heuristic.py's page weights, spread over nine categories (sum 100). */
const PAGE_BASE: Record<PageType, Record<CategoryId, number>> = {
  product: { cta: 18, pricing: 12, trust: 10, "social-proof": 12, content: 14, media: 12, accessibility: 7, technical: 6, mobile: 9 },
  homepage: { cta: 12, pricing: 6, trust: 12, "social-proof": 12, content: 22, media: 12, accessibility: 8, technical: 6, mobile: 10 },
  category: { cta: 14, pricing: 10, trust: 10, "social-proof": 10, content: 20, media: 14, accessibility: 7, technical: 6, mobile: 9 },
};

const SITE_TILT: Record<SiteType, Record<CategoryId, number>> = {
  ecommerce: { cta: 1.1, pricing: 1.2, trust: 1, "social-proof": 1.2, content: 0.9, media: 1.2, accessibility: 1, technical: 0.9, mobile: 1.1 },
  saas: { cta: 1.2, pricing: 0.9, trust: 1.1, "social-proof": 1, content: 1.2, media: 0.7, accessibility: 1, technical: 1, mobile: 1 },
  b2b: { cta: 1.1, pricing: 0.5, trust: 1.4, "social-proof": 1.2, content: 1.3, media: 0.6, accessibility: 1, technical: 1, mobile: 0.9 },
};

/** How much a check matters per site type (missing = 1, 0 = doesn't apply). */
export const SIGNAL_SITE: Record<string, Partial<Record<SiteType, number>>> = {
  "cta-delivery": { saas: 0, b2b: 0 },
  "price-found": { b2b: 0.4 },
  "price-near-cta": { saas: 0.7, b2b: 0.3 },
  "price-currency": { b2b: 0.4 },
  "price-payment-options": { saas: 0.3, b2b: 0 },
  "price-shipping-cost": { saas: 0, b2b: 0 },
  "price-plans": { ecommerce: 0, b2b: 0.6 },
  "trust-returns": { saas: 0.4, b2b: 0.2 },
  "proof-quotes": { ecommerce: 0.5, b2b: 1.2 },
  "proof-client-logos": { ecommerce: 0.3, b2b: 1.5 },
  "proof-case-studies": { ecommerce: 0, saas: 0.8, b2b: 1.5 },
  "proof-rating-near-title": { saas: 0.3, b2b: 0 },
  "proof-review-count": { saas: 0.6, b2b: 0.4 },
  "proof-rating": { saas: 0.6, b2b: 0.4 },
  "content-variants": { saas: 0, b2b: 0 },
  "content-related": { saas: 0.3, b2b: 0.3 },
  "content-specs": { saas: 0.6, b2b: 0.8 },
  "content-search": { saas: 0.5, b2b: 0.5 },
  "media-gallery": { saas: 0.4, b2b: 0.3 },
  "media-image-count": { saas: 0.6, b2b: 0.5 },
  "tech-schema-offer": { saas: 0.5, b2b: 0 },
  "tech-schema-rating": { b2b: 0.5 },
  "mobile-input-types": { ecommerce: 0.6 },
};

/** How much a check matters per page type. */
export const SIGNAL_PAGE: Record<string, Partial<Record<PageType, number>>> = {
  "price-found": { homepage: 0.5 },
  "price-near-cta": { homepage: 0.3, category: 0.5 },
  "price-currency": { homepage: 0.5 },
  "cta-delivery": { homepage: 0.3, category: 0.3 },
  "cta-grouped": { homepage: 0.5, category: 0.5 },
  "content-variants": { homepage: 0, category: 0 },
  "content-related": { homepage: 0.3, category: 0.3 },
  "content-specs": { homepage: 0.4, category: 0.3 },
  "content-description": { homepage: 0.6, category: 0.4 },
  "content-faq": { category: 0.5 },
  "proof-rating-near-title": { homepage: 0.3, category: 0.5 },
  "media-gallery": { homepage: 0.4, category: 0.3 },
  "media-video": { category: 0.5 },
  "tech-schema-offer": { homepage: 0.3 },
  "tech-schema-rating": { homepage: 0.5 },
};

const CREDIT: Record<SignalStatus, number> = { pass: 1, warn: 0.5, fail: 0 };

export type Weights = Record<CategoryId, number>;
export type WeightOverrides = Partial<Record<CategoryId, number>>;

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Category weights for a site and page type, as integers that sum to 100. */
export function defaultWeights(site: SiteType, page: PageType): Weights {
  const raw = CATEGORY_IDS.map((id) => PAGE_BASE[page][id] * SITE_TILT[site][id]);
  const total = raw.reduce((a, b) => a + b, 0);
  const exact = raw.map((v) => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  // largest remainder, so the integers still add up to 100
  const order = exact.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return Object.fromEntries(CATEGORY_IDS.map((id, i) => [id, floors[i]])) as Weights;
}

export function resolveWeights(site: SiteType, page: PageType, overrides?: WeightOverrides): Weights {
  const base = defaultWeights(site, page);
  if (!overrides) return base;
  const out = { ...base };
  for (const id of CATEGORY_IDS) {
    const v = overrides[id];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[id] = v;
  }
  return out;
}

/** A check's weight after the site and page multipliers (0 = not scored). */
export function signalWeight(signal: Pick<Signal, "id" | "weight">, site: SiteType, page: PageType): number {
  return signal.weight * (SIGNAL_SITE[signal.id]?.[site] ?? 1) * (SIGNAL_PAGE[signal.id]?.[page] ?? 1);
}

export function scoreSignals(signals: Signal[], siteType: SiteType, pageType: PageType, weightOverrides?: WeightOverrides): ScoreResult {
  const weights = resolveWeights(siteType, pageType, weightOverrides);
  const categories: CategoryScore[] = CATEGORY_IDS.map((id) => {
    const counts = { pass: 0, warn: 0, fail: 0 };
    let wsum = 0;
    let got = 0;
    let applicable = 0;
    for (const s of signals) {
      if (s.category !== id) continue;
      counts[s.status] += 1;
      const w = signalWeight(s, siteType, pageType);
      if (w <= 0) continue;
      applicable += 1;
      wsum += w;
      got += w * CREDIT[s.status];
    }
    return {
      id,
      label: CATEGORY_LABELS[id],
      score: wsum > 0 ? round1((100 * got) / wsum) : 0,
      weight: weights[id],
      counts,
      applicable,
    };
  });

  const usable = categories.filter((c) => c.applicable > 0 && c.weight > 0);
  const total = usable.reduce((a, c) => a + c.weight, 0);
  const overall = total > 0 ? round1(usable.reduce((a, c) => a + c.score * c.weight, 0) / total) : 0;
  return { overall, categories };
}

export type SignalImpact = {
  /** points of the overall (0..100) this check is worth */
  max: number;
  /** points it currently costs (0 when it passes) */
  lost: number;
};

/** What each check is worth in overall points; all applicable checks sum to 100. */
export function signalImpact(
  signals: Signal[],
  siteType: SiteType,
  pageType: PageType,
  weightOverrides?: WeightOverrides,
): Record<string, SignalImpact> {
  const result = scoreSignals(signals, siteType, pageType, weightOverrides);
  const usable = result.categories.filter((c) => c.applicable > 0 && c.weight > 0);
  const total = usable.reduce((a, c) => a + c.weight, 0);
  const sums = new Map<CategoryId, number>();
  for (const s of signals) {
    const w = signalWeight(s, siteType, pageType);
    if (w > 0) sums.set(s.category, (sums.get(s.category) ?? 0) + w);
  }
  const out: Record<string, SignalImpact> = {};
  for (const s of signals) {
    const cat = usable.find((c) => c.id === s.category);
    const w = signalWeight(s, siteType, pageType);
    const sum = sums.get(s.category) ?? 0;
    if (!cat || w <= 0 || sum <= 0 || total <= 0) {
      out[s.id] = { max: 0, lost: 0 };
      continue;
    }
    const max = (cat.weight / total) * 100 * (w / sum);
    out[s.id] = { max, lost: max * (1 - CREDIT[s.status]) };
  }
  return out;
}

export type Grade = { letter: "A" | "B" | "C" | "D" | "F"; word: string };

export function grade(score: number): Grade {
  if (score >= 90) return { letter: "A", word: "Excellent" };
  if (score >= 80) return { letter: "B", word: "Good" };
  if (score >= 68) return { letter: "C", word: "Fair" };
  if (score >= 55) return { letter: "D", word: "Weak" };
  return { letter: "F", word: "Poor" };
}

export function statusCounts(signals: Signal[]): Record<SignalStatus, number> {
  const c = { pass: 0, warn: 0, fail: 0 };
  for (const s of signals) c[s.status] += 1;
  return c;
}
