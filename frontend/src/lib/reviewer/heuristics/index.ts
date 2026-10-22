import type { ClassifyEvent, LegacyScores, PageFacts, PageType, Signal, SiteType } from "../types";
import { load, pageText } from "./dom";
import { calculateConversionScores } from "./conversion";
import { extractExtras, type ExtraFacts, type RenderedFacts } from "./extras";
import {
  detectPageType,
  detectSiteType,
  extractBasicInfo,
  extractCtaInfo,
  extractImageInfo,
  extractPricingInfo,
  extractTechnicalInfo,
  extractTestimonialInfo,
  extractTrustInfo,
  getDynamicKeywords,
  readJsonLd,
  summarizeStructure,
  TRUST_WORDS,
  type HeuristicsData,
  type RawPageType,
  type RawSiteType,
} from "./port";
import { buildSignals } from "./signals";

export type { RenderedFacts, ExtraFacts, HeuristicsData };
export { ctaTexts, getDynamicKeywords, detectSiteType } from "./port";

export type HeuristicsResult = {
  data: HeuristicsData;
  extras: ExtraFacts;
  legacy: LegacyScores;
  classification: ClassifyEvent;
  signals: Signal[];
  facts: PageFacts;
};

/** softmax with temperature 2: 9/3/1 hits reads as ~94% sure, 3/2/2 as ~45%. */
function softmax(values: number[], t = 2): number[] {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp((v - max) / t));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The original detects five site types; the rebuild scores three.
 * "service" and "generic" map to the closest of the three, and the
 * confidence keeps "service" in the denominator so a services page
 * reads as unsure instead of confidently ecommerce.
 */
export function classify(
  siteScores: Record<string, number>,
  pageScores: Record<string, number>,
  rawPage: RawPageType,
  pinned: SiteType | null,
  productSchema = false,
): ClassifyEvent {
  const order: SiteType[] = ["ecommerce", "saas", "b2b"];
  let detected: SiteType = "ecommerce";
  for (const t of order) if ((siteScores[t] ?? 0) > (siteScores[detected] ?? 0)) detected = t;
  const probs = softmax([...order.map((t) => siteScores[t] ?? 0), siteScores.service ?? 0]);
  const confidence = round2(probs[order.indexOf(detected)]);

  const pages: PageType[] = ["product", "homepage", "category"];
  const pprobs = softmax(pages.map((p) => pageScores[p] ?? 0));
  let pageType: PageType = rawPage === "unknown" ? "product" : rawPage;
  let pageConfidence = round2(pprobs[pages.indexOf(pageType)]);
  let pageReason: string | undefined;
  // big product pages carry mega-menus and footers full of "homepage" words;
  // exactly one Product in the structured data is the stronger tell
  if (productSchema && pageType !== "product") {
    pageType = "product";
    pageConfidence = Math.max(round2(pprobs[0]), 0.8);
    pageReason = "Product structured data";
  }

  return {
    siteType: pinned ?? detected,
    detected,
    pageType,
    confidence,
    pageConfidence,
    scores: siteScores,
    pageScores,
    pinned: pinned !== null,
    ...(pageReason ? { pageReason } : {}),
  };
}

export function runHeuristics(
  html: string,
  opts: { url: string; siteType?: "auto" | SiteType; rendered?: RenderedFacts | null },
): HeuristicsResult {
  const $ = load(html);
  const text = pageText($);
  const lower = text.toLowerCase();

  const site = detectSiteType(lower);
  const page = detectPageType(lower);
  const pinned = opts.siteType && opts.siteType !== "auto" ? opts.siteType : null;
  const rawSite: RawSiteType = pinned ?? site.type;
  const keywords = getDynamicKeywords(rawSite);

  const basic = extractBasicInfo($, keywords);
  const pricing = extractPricingInfo($, text);
  const cta = extractCtaInfo($, keywords);
  const images = extractImageInfo($);
  const ld = readJsonLd($);
  const testimonials = extractTestimonialInfo($, ld);
  const trust = extractTrustInfo($, lower);
  const technical = extractTechnicalInfo($, html);
  const structure = summarizeStructure($, basic.h1);

  const data: HeuristicsData = {
    site_type: rawSite,
    page_type: page.type,
    ...basic,
    ...pricing,
    ...cta,
    ...images,
    ...testimonials,
    ...trust,
    ...technical,
    ...structure,
  };

  const extras = extractExtras($, {
    url: opts.url,
    text,
    ld,
    testimonials: testimonials.testimonials,
    price: pricing.price,
    keywords,
    trustWords: TRUST_WORDS,
  });

  const signals = buildSignals({ d: data, x: extras, r: opts.rendered ?? null });

  return {
    data,
    extras,
    legacy: calculateConversionScores(data),
    classification: classify(site.scores, page.scores, page.type, pinned, ld.product_count === 1),
    signals,
    facts: {
      title: data.title,
      h1: data.h1,
      price: data.price,
      cta: data.cta,
      imageCount: extras.media_count,
      reviewCount: extras.review_count,
      rating: data.average_rating ?? extras.text_rating,
      htmlKb: Math.round(data.html_bytes / 1024),
    },
  };
}
