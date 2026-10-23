/* ─────────────────────────────────────────────────────────
 * REVIEWER TYPES — shared by the heuristics (server), the
 * SSE route, and the UI. Isomorphic: no node imports here.
 * ───────────────────────────────────────────────────────── */

export const SITE_TYPES = ["ecommerce", "saas", "b2b"] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const PAGE_TYPES = ["product", "homepage", "category"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const CATEGORY_IDS = [
  "cta",
  "pricing",
  "trust",
  "social-proof",
  "content",
  "media",
  "accessibility",
  "technical",
  "mobile",
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export type SignalStatus = "pass" | "warn" | "fail";

/** One check against the page. `weight` is the base weight (1 to 3). */
export type Signal = {
  id: string;
  category: CategoryId;
  label: string;
  status: SignalStatus;
  weight: number;
  evidence?: string;
  fix?: string;
  /** which X-ray box kind shows this signal on the capture, if any */
  box?: BoxKind;
};

export const BOX_KINDS = ["cta", "price", "trust", "reviews", "hero", "h1", "form"] as const;
export type BoxKind = (typeof BOX_KINDS)[number];

/** An element found on the rendered page, in capture (CSS) pixels. */
export type Box = {
  kind: BoxKind;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** short text sample from the element */
  text?: string;
  /** the primary CTA the heuristics also picked */
  primary?: boolean;
};

export type TaskId = "capture" | "classify" | "checks" | "score" | "report";
export type TaskStatus = "queued" | "running" | "done" | "failed";
export type TaskDetail = { label: string; meta: string };

export type TaskEvent = {
  id: TaskId;
  label: string;
  status: TaskStatus;
  meta?: string;
  details?: TaskDetail[];
};

export type CaptureEngine = "playwright" | "fetch" | "sample";

export type CaptureEvent = {
  /** data URL of the first screen (JPEG), or null when only HTML could be fetched */
  src: string | null;
  /** data URL of the page below the fold, stacked under `src` */
  srcBelow: string | null;
  /** capture size in CSS pixels (both images stacked) */
  width: number;
  height: number;
  /** the fold: the browser viewport height used for the capture */
  viewportHeight: number;
  /** full document height, may exceed the captured height */
  pageHeight: number;
  engine: CaptureEngine;
  url: string;
  finalUrl: string;
  title: string;
  elapsedMs: number;
  note?: string;
};

export type ClassifyEvent = {
  /** the type the page is scored as (detected, or the one the request asked for) */
  siteType: SiteType;
  detected: SiteType;
  pageType: PageType;
  /** 0..1, from the keyword score margins */
  confidence: number;
  pageConfidence: number;
  /** keyword hits per site type (includes the original's "service" bucket) */
  scores: Record<string, number>;
  pageScores: Record<string, number>;
  /** true when the request pinned the site type */
  pinned: boolean;
  /** why the page type differs from the keyword count, if it does */
  pageReason?: string;
};

export type CategoryScore = {
  id: CategoryId;
  label: string;
  /** 0..100 */
  score: number;
  /** effective weight used in the overall (relative, not normalized) */
  weight: number;
  counts: { pass: number; warn: number; fail: number };
  /** signals that count for this site and page type */
  applicable: number;
};

export type ScoreResult = {
  /** 0..100, one decimal */
  overall: number;
  categories: CategoryScore[];
};

/** The original heuristic.py calculate_conversion_scores output (0..10 each). */
export type LegacyScores = {
  value_proposition_clarity: number;
  cta_effectiveness: number;
  trust_social_proof: number;
  visual_imagery: number;
  mobile_accessibility: number;
  technical_performance: number;
  user_experience: number;
  conversion_optimization: number;
  overall_score: number;
};

export type ScoresEvent = ScoreResult & { legacy: LegacyScores };

export type Impact = "high" | "medium" | "low";

export type Recommendation = {
  id: string;
  title: string;
  detail: string;
  impact: Impact;
  signalIds: string[];
  /** 0..1 */
  confidence: number;
  /** overall points this fix is worth if the cited checks pass */
  points?: number;
};

export type RecommendationsEvent = {
  items: Recommendation[];
  summary: string;
  source: "llm" | "rules";
  model?: string;
};

/** Plain facts about the page, for the UI's wireframe and copy. */
export type PageFacts = {
  title: string;
  h1: string;
  price: string;
  cta: string | null;
  imageCount: number;
  reviewCount: number;
  rating: number | null;
  htmlKb: number;
};

export type AuditRequest = {
  url: string;
  siteType?: "auto" | SiteType;
};

export const SAMPLE_IDS = ["strong", "weak"] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];
