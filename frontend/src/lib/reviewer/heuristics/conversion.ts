import type { LegacyScores } from "../types";
import type { HeuristicsData } from "./port";

/* ─────────────────────────────────────────────────────────
 * calculate_conversion_scores, ported line for line. Eight
 * 0..10 sub-scores and a page-type weighted overall (0..10).
 * The rebuild scores with signals (score.ts); this stays as
 * the "original formula" readout and as a regression anchor.
 * ───────────────────────────────────────────────────────── */

const WEIGHTS: Record<"product" | "homepage" | "other", Record<Exclude<keyof LegacyScores, "overall_score">, number>> = {
  product: {
    value_proposition_clarity: 0.25,
    cta_effectiveness: 0.2,
    trust_social_proof: 0.15,
    visual_imagery: 0.15,
    mobile_accessibility: 0.1,
    technical_performance: 0.05,
    user_experience: 0.05,
    conversion_optimization: 0.05,
  },
  homepage: {
    value_proposition_clarity: 0.3,
    cta_effectiveness: 0.1,
    trust_social_proof: 0.15,
    visual_imagery: 0.15,
    mobile_accessibility: 0.1,
    technical_performance: 0.05,
    user_experience: 0.1,
    conversion_optimization: 0.05,
  },
  other: {
    value_proposition_clarity: 0.25,
    cta_effectiveness: 0.15,
    trust_social_proof: 0.15,
    visual_imagery: 0.15,
    mobile_accessibility: 0.1,
    technical_performance: 0.05,
    user_experience: 0.1,
    conversion_optimization: 0.05,
  },
};

type Input = Pick<
  HeuristicsData,
  | "site_type"
  | "page_type"
  | "title"
  | "h1"
  | "price"
  | "is_free_product"
  | "has_subheadings"
  | "cta"
  | "cta_above_fold"
  | "price_near_cta"
  | "shipping_returns_near_cta"
  | "testimonials"
  | "has_reviews_or_ratings"
  | "average_rating"
  | "trust_indicators"
  | "image_count"
  | "alt_coverage"
  | "gallery_present"
  | "viewport_present"
  | "a11y_unlabeled_buttons"
  | "a11y_unlabeled_links"
  | "html_bytes"
  | "external_script_count"
  | "meta_title_len"
  | "meta_description_len"
  | "form_count"
  | "popup_count"
  | "modals_with_cta"
  | "breadcrumbs_present"
  | "has_search"
  | "cta_grouping"
  | "main_present"
  | "related_products_present"
  | "h1_count"
  | "section_count"
>;

export function calculateConversionScores(d: Input): LegacyScores {
  const siteType = d.site_type ?? "generic";

  let clarity = 0;
  if (d.title && d.title.length > 10) clarity += 3;
  if (d.h1 && d.h1.length > 5) clarity += 3;
  if (d.price) clarity += 2;
  else if (d.is_free_product) clarity += 2;
  else if (siteType === "saas" || siteType === "b2b") clarity += 1;
  if (d.has_subheadings) clarity += 2;

  let cta = 0;
  if (d.cta) cta += 4;
  if (d.cta_above_fold) cta += 3;
  if (d.price_near_cta) cta += 2;
  if (siteType === "ecommerce" && d.shipping_returns_near_cta) cta += 1;
  else if (siteType !== "ecommerce") cta += 1;

  let trust = 0;
  const testimonials = d.testimonials ?? 0;
  if (testimonials > 0) trust += Math.min(4, testimonials);
  if (d.has_reviews_or_ratings) trust += 2;
  if (d.average_rating && d.average_rating >= 4.0) trust += 2;
  if ((d.trust_indicators?.effective_trust_badges ?? 0) > 0) trust += 1;
  if ((d.trust_indicators?.guarantees ?? 0) > 0) trust += 1;

  let imagery = 0;
  const images = d.image_count ?? 0;
  if (images > 0) imagery += 3;
  if (images >= 3) imagery += 2;
  else if (images >= 1) imagery += 1;
  const alt = d.alt_coverage ?? 0;
  if (alt >= 0.8) imagery += 3;
  else if (alt >= 0.5) imagery += 2;
  else if (alt > 0) imagery += 1;
  if (d.gallery_present) imagery += 2;

  let mobile = 0;
  if (d.viewport_present) mobile += 4;
  const ab = d.a11y_unlabeled_buttons ?? 0;
  const al = d.a11y_unlabeled_links ?? 0;
  if (ab === 0 && al === 0) mobile += 3;
  else if (ab <= 2 && al <= 5) mobile += 2;
  else if (ab <= 5 && al <= 10) mobile += 1;
  if (alt >= 0.8) mobile += 3;
  else if (alt > 0) mobile += 1;

  let perf = 0;
  const bytes = d.html_bytes ?? 0;
  if (bytes < 200_000) perf += 4;
  else if (bytes < 1_000_000) perf += 3;
  else if (bytes < 2_000_000) perf += 2;
  else perf += 1;
  const scripts = d.external_script_count ?? 0;
  if (scripts < 15) perf += 2;
  else if (scripts < 30) perf += 1;
  if (d.meta_title_len >= 30 && d.meta_title_len <= 60) perf += 2;
  if (d.meta_description_len >= 120 && d.meta_description_len <= 160) perf += 2;

  let ux = 10;
  if ((d.form_count ?? 0) > 3) ux -= 2;
  if ((d.popup_count ?? 0) > 0) ux -= 3;
  if (d.modals_with_cta) ux -= 2;
  if (!d.breadcrumbs_present) ux -= 1;
  if (!d.has_search) ux -= 1;

  let conversion = 0;
  if (d.cta_grouping) conversion += 3;
  if (d.main_present) conversion += 2;
  if (d.related_products_present) conversion += 2;
  if ((d.h1_count ?? 0) === 1) conversion += 2;
  if ((d.section_count ?? 0) >= 3) conversion += 1;

  const scores = {
    value_proposition_clarity: Math.min(10, clarity),
    cta_effectiveness: Math.min(10, cta),
    trust_social_proof: Math.min(10, trust),
    visual_imagery: Math.min(10, imagery),
    mobile_accessibility: Math.min(10, mobile),
    technical_performance: Math.min(10, perf),
    user_experience: Math.max(0, ux),
    conversion_optimization: Math.min(10, conversion),
  };

  const weights = d.page_type === "product" ? WEIGHTS.product : d.page_type === "homepage" ? WEIGHTS.homepage : WEIGHTS.other;
  let overall = 0;
  for (const [k, w] of Object.entries(weights) as [keyof typeof scores, number][]) overall += scores[k] * w;

  return { ...scores, overall_score: Math.round(overall * 10) / 10 };
}
