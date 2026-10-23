import type { Box } from "../types";
import {
  ancestors,
  attr,
  textNodes,
  classMatches,
  descendants,
  hasAncestor,
  isAttrHidden,
  normalize,
  stringsMatching,
  textOf,
  words,
  type CheerioAPI,
  type Element,
} from "./dom";
import { findCtaNode, type JsonLdFacts, type Keywords } from "./port";

/* ─────────────────────────────────────────────────────────
 * EXTRA FACTS — things the rebuild checks that heuristic.py
 * never measured (page language, form labels, variants,
 * shipping terms, review counts...). Each one feeds a signal.
 * ───────────────────────────────────────────────────────── */

/** What only a real browser can see; absent for the fetch fallback. */
export type RenderedFacts = {
  viewportWidth: number;
  viewportHeight: number;
  pageHeight: number;
  /** share (0..1) of the first screen covered by a visible fixed overlay */
  overlayCoverage: number;
  overlayText?: string;
  boxes: Box[];
};

export type ExtraFacts = {
  url_https: boolean | null;
  lang: string;
  viewport_content: string;
  zoom_blocked: boolean;
  skip_link: boolean;
  heading_skip: string | null;
  form_inputs: number;
  form_inputs_labeled: number;
  contact_inputs: number;
  contact_inputs_typed: number;
  description_words: number;
  specs_present: boolean;
  faq_questions: number;
  faq_heading: boolean;
  variants: string[];
  video_present: boolean;
  contact_kinds: string[];
  privacy_link: boolean;
  terms_link: boolean;
  about_link: boolean;
  payment_names: string[];
  card_marks: string[];
  shipping_phrase: string | null;
  shipping_mentioned: boolean;
  returns_phrase: string | null;
  returns_mentioned: boolean;
  plan_prices: number;
  review_count: number;
  review_count_source: "structured data" | "page text" | "review items" | "heuristic" | "none";
  rating_near_title: boolean;
  text_rating: number | null;
  numbers_phrase: string | null;
  badge_labels: string[];
  media_count: number;
  quote_count: number;
  client_logo_count: number;
  press_phrases: string[];
  case_studies: boolean;
  jsonld: JsonLdFacts;
  img_total: number;
  img_with_dims: number;
  img_lazy: number;
  responsive_images: number;
  alt_described: number;
  alt_total: number;
  competing_cta_labels: string[];
  cta_tag: string | null;
  custom_pricing: boolean;
  free_explicit: boolean;
  price_has_amount: boolean;
  guarantee_phrase: string | null;
  trust_terms: string[];
};

const PRIMARY_ACTION_RE =
  /add to (cart|bag|basket)|buy (it )?now|\bbuy\b|checkout|order now|shop now|get started|start (free|now|trial|your)|try (it )?(free|now)|free trial|sign up|subscribe|book (a )?demo|request (a )?demo|schedule (a )?demo|contact sales|talk to sales|get (a )?quote|pre-?order|join now|create account/i;

function tidy(m: string, max: number): string {
  const p = normalize(m).replace(/[.,;:!]+$/, "");
  return p.length > max ? `${p.slice(0, max - 1).trimEnd()}…` : p;
}

/**
 * First match of the highest-priority pattern, searched one text node at a
 * time so a phrase never runs on into the next element's copy.
 */
function nodePhrase($: CheerioAPI, patterns: RegExp[], max = 52): string | null {
  const nodes = textNodes($.root()[0]).map((t) => t.data);
  for (const re of patterns) {
    for (const s of nodes) {
      const m = s.match(re);
      if (m) return tidy(m[0], max);
    }
  }
  return null;
}

function badgeLabels($: CheerioAPI): string[] {
  const re = /badge|certification|award/i;
  return $("span, div, li, p, img, a")
    .toArray()
    .filter((el) => classMatches(el, re) || (el.name === "img" && /badge/i.test(attr(el, "alt") ?? "")))
    .filter((el) => !descendants(el).some((d) => classMatches(d, re)))
    .map((el) => (el.name === "img" ? (attr(el, "alt") ?? "") : textOf(el)))
    .map((t) => normalize(t))
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 3);
}

function linkMatches($: CheerioAPI, re: RegExp): boolean {
  return $("a")
    .toArray()
    .some((a) => re.test(textOf(a)) || re.test(attr(a, "href") ?? ""));
}

function headingSkip($: CheerioAPI): string | null {
  let prev = 0;
  for (const el of $("h1, h2, h3, h4, h5, h6").toArray()) {
    const level = Number(el.name.slice(1));
    if (prev > 0 && level > prev + 1) return `H${prev} to H${level}`;
    prev = level;
  }
  return null;
}

function formLabels($: CheerioAPI): { total: number; labeled: number } {
  const fields = $("input, select, textarea")
    .toArray()
    .filter((el) => {
      if (el.name !== "input") return true;
      const type = (attr(el, "type") ?? "text").toLowerCase();
      return !["hidden", "submit", "button", "image", "reset"].includes(type);
    })
    .filter((el) => !isAttrHidden(el));
  let labeled = 0;
  for (const el of fields) {
    const aria = (attr(el, "aria-label") ?? attr(el, "title") ?? "").trim();
    const by = attr(el, "aria-labelledby");
    const id = attr(el, "id");
    const forLabel = id ? $(`label[for="${id.replace(/"/g, "")}"]`).length > 0 : false;
    const wrapped = hasAncestor(el, ["label"]);
    if (aria || by || forLabel || wrapped) labeled += 1;
  }
  return { total: fields.length, labeled };
}

function contactInputs($: CheerioAPI): { total: number; typed: number } {
  let total = 0;
  let typed = 0;
  for (const el of $("input").toArray()) {
    const hint = [attr(el, "name"), attr(el, "id"), attr(el, "autocomplete"), attr(el, "placeholder")].join(" ");
    const type = (attr(el, "type") ?? "text").toLowerCase();
    if (/e-?mail/i.test(hint)) {
      total += 1;
      if (type === "email") typed += 1;
    } else if (/phone|\btel\b|mobile/i.test(hint)) {
      total += 1;
      if (type === "tel") typed += 1;
    }
  }
  return { total, typed };
}

function descriptionWords($: CheerioAPI): number {
  let best = 0;
  $('[class*="description" i], [id*="description" i], [itemprop="description"]').each((_, el) => {
    if (el.name === "meta") return;
    best = Math.max(best, words(textOf(el)));
  });
  let paragraphs = 0;
  $("p").each((_, el) => {
    if (hasAncestor(el, ["header", "footer", "nav", "aside", "form"])) return;
    if ([el, ...ancestors(el)].some((a) => classMatches(a, /review|testimonial|newsletter|cookie|modal|popup/i))) return;
    paragraphs += words(textOf(el));
  });
  return Math.max(best, paragraphs);
}

function variantKinds($: CheerioAPI): string[] {
  const kinds = new Set<string>();
  const legendText = $("legend, label, [role=radiogroup]")
    .toArray()
    .map((el) => textOf(el) + " " + (attr(el, "aria-label") ?? ""))
    .join(" | ");
  if (
    $('[class*="swatch" i], select[name*="colo" i], input[name*="colo" i], [aria-label*="color" i], [aria-label*="colour" i]').length ||
    /\bcolou?rs?\b/i.test(legendText)
  )
    kinds.add("color");
  if ($('select[name*="size" i], input[name*="size" i], [aria-label*="size" i]').length || /\bsizes?\b/i.test(legendText)) kinds.add("size");
  if ($('[class*="variant" i], select[name*="option" i], input[name*="option" i]').length) kinds.add("option");
  return [...kinds];
}

function reviewCount($: CheerioAPI, ld: JsonLdFacts, testimonials: number): Pick<ExtraFacts, "review_count" | "review_count_source"> {
  if (ld.review_count && ld.review_count > 0) return { review_count: ld.review_count, review_count_source: "structured data" };
  let fromText = 0;
  for (const s of stringsMatching($, /\d[\d,]*\s+(?:customer\s+|verified\s+)?(?:reviews|ratings)\b/i)) {
    for (const m of s.matchAll(/(\d[\d,]*)\s+(?:customer\s+|verified\s+)?(?:reviews|ratings)\b/gi)) {
      fromText = Math.max(fromText, parseInt(m[1].replace(/,/g, ""), 10) || 0);
    }
  }
  if (fromText > 0) return { review_count: fromText, review_count_source: "page text" };
  const items = $("article, li, div, blockquote")
    .toArray()
    .filter((el) => classMatches(el, /^(review|review-item|testimonial)$|review-card|review_card/i))
    .filter((el) => !descendants(el).some((d) => classMatches(d, /^(review|review-item|testimonial)$|review-card|review_card/i)));
  if (items.length > 0) return { review_count: items.length, review_count_source: "review items" };
  if (testimonials > 0) return { review_count: testimonials, review_count_source: "heuristic" };
  return { review_count: 0, review_count_source: "none" };
}

function ratingNearTitle($: CheerioAPI): boolean {
  const h1 = $("h1").first()[0];
  if (!h1) return false;
  const scopes = ancestors(h1).slice(0, 3);
  return scopes.some((scope) => {
    const t = textOf(scope);
    if (/★|\d(?:\.\d)?\s*(?:out of|\/)\s*5|\d[\d,]*\s+reviews|\brating\b/i.test(t)) return true;
    return descendants(scope).some((d) => classMatches(d, /rating|stars|review-summary/i));
  });
}

function clientLogos($: CheerioAPI): number {
  const found = new Set<Element>();
  $("img").each((_, img) => {
    if (hasAncestor(img, ["header", "nav"])) return;
    const alt = attr(img, "alt") ?? "";
    const inLogoStrip = ancestors(img)
      .slice(0, 4)
      .some((a) => classMatches(a, /client|partner|customer|logos|brands|trusted|press|as-seen/i));
    if (inLogoStrip || /logo/i.test(alt)) found.add(img);
  });
  return found.size;
}

const PAYMENT_NAMES: [RegExp, string][] = [
  [/shop pay/i, "Shop Pay"],
  [/paypal/i, "PayPal"],
  [/apple pay/i, "Apple Pay"],
  [/google pay/i, "Google Pay"],
  [/amazon pay/i, "Amazon Pay"],
  [/klarna/i, "Klarna"],
  [/afterpay/i, "Afterpay"],
  [/sezzle/i, "Sezzle"],
  [/\baffirm\b/i, "Affirm"],
];

const CARD_MARKS: [RegExp, string][] = [
  [/\bvisa\b/i, "Visa"],
  [/mastercard/i, "Mastercard"],
  [/american express|\bamex\b/i, "Amex"],
];

function namesIn(text: string, $: CheerioAPI, table: [RegExp, string][]): string[] {
  const alts = $("img[alt], [aria-label]")
    .toArray()
    .map((el) => `${attr(el, "alt") ?? ""} ${attr(el, "aria-label") ?? ""}`)
    .join(" ");
  const hay = `${text} ${alts}`;
  return table.filter(([re]) => re.test(hay)).map(([, name]) => name);
}

export function extractExtras(
  $: CheerioAPI,
  ctx: { url: string; text: string; ld: JsonLdFacts; testimonials: number; price: string; keywords: Keywords; trustWords: string[] },
): ExtraFacts {
  const { text, ld } = ctx;
  const lower = text.toLowerCase();

  let url_https: boolean | null = null;
  try {
    url_https = new URL(ctx.url).protocol === "https:";
  } catch {
    url_https = null;
  }

  const viewport_content = ($('meta[name="viewport" i]').attr("content") ?? "").trim();
  const maxScale = viewport_content.match(/maximum-scale\s*=\s*([\d.]+)/i);
  const zoom_blocked = /user-scalable\s*=\s*(no|0)\b/i.test(viewport_content) || (!!maxScale && Number(maxScale[1]) < 2);

  const labels = formLabels($);
  const contact = contactInputs($);

  const specs_present =
    $("table, dl").length > 0 ||
    $("h2, h3, h4, summary, dt, th, button, [role=tab]")
      .toArray()
      .some((el) => /spec|dimension|material|details|features|tech/i.test(textOf(el)));

  const summaries = $("details > summary").toArray();
  const questionEls = $("h3, h4, dt, summary, button, strong")
    .toArray()
    .filter((el) => /\?\s*$/.test(textOf(el)));
  const faq_heading = $("h2, h3, h4, summary")
    .toArray()
    .some((el) => /\bfaqs?\b|frequently asked|common questions|questions\b/i.test(textOf(el)));
  const faq_questions = Math.max(summaries.length, questionEls.length);

  const contact_kinds: string[] = [];
  if ($('a[href^="mailto:"]').length) contact_kinds.push("email");
  if ($('a[href^="tel:"]').length) contact_kinds.push("phone");
  if (linkMatches($, /contact|support|help center|customer (service|care)/i)) contact_kinds.push("contact page");
  if (/live chat|chat with us/i.test(text)) contact_kinds.push("chat");

  const plan = text.match(/[$£€]\s*\d[\d,]*(?:\.\d{2})?\s*(?:\/\s?(?:mo|month|yr|year|user|seat)\b|per\s+(?:month|year|user|seat))/gi) ?? [];

  const imgs = $("img").toArray();
  const meaningfulImgs = imgs.filter((img) => {
    const alt = attr(img, "alt");
    const role = (attr(img, "role") ?? "").toLowerCase();
    if (alt !== undefined && alt.trim() === "") return false; // decorative by design
    if (role === "presentation" || role === "none" || attr(img, "aria-hidden") === "true") return false;
    return true;
  });
  const describedImgs = meaningfulImgs.filter(
    (img) => (attr(img, "alt") ?? "").trim() || (attr(img, "aria-label") ?? "").trim() || attr(img, "aria-labelledby"),
  ).length;
  const svgs = $("svg")
    .toArray()
    .filter((svg) => {
      if (attr(svg, "aria-hidden") === "true") return false;
      const role = (attr(svg, "role") ?? "").toLowerCase();
      if (role === "presentation" || role === "none") return false;
      // icons inside a named control take their name from the control
      return !hasAncestor(svg, ["button", "a", "label"]);
    });
  const describedSvgs = svgs.filter(
    (svg) => (attr(svg, "aria-label") ?? "").trim() || attr(svg, "aria-labelledby") || textOf($(svg).children("title")[0]),
  ).length;

  const competing = new Set<string>();
  for (const el of $("button, a, input[type=submit], input[type=button]").toArray()) {
    if (isAttrHidden(el)) continue;
    const label = normalize(attr(el, "value") || attr(el, "aria-label") || textOf(el)).toLowerCase();
    if (label && label.length <= 40 && PRIMARY_ACTION_RE.test(label)) competing.add(label);
  }

  const ctaNode = findCtaNode($, ctx.keywords);
  const press = new Set<string>();
  for (const s of stringsMatching(
    $,
    /as seen (?:in|on)|featured (?:in|on|by)|award[- ]winning|\bawards?\b|editors?['’]?s? (?:choice|pick)|best of 20\d\d|\bwinner\b/i,
  )) {
    const m = s.match(/as seen (?:in|on)|featured (?:in|on|by)|award[- ]winning|\bawards?\b|editors?['’]?s? (?:choice|pick)|best of 20\d\d|\bwinner\b/i);
    if (m) press.add(tidy(m[0], 30).toLowerCase());
    if (press.size >= 3) break;
  }

  const quoted = stringsMatching($, /["“][^"”]{20,}["”]/).length;
  const testimonialItems = $("div, li, article, figure, blockquote")
    .toArray()
    .filter((el) => classMatches(el, /^testimonial$|testimonial-item|quote-card/i)).length;

  return {
    url_https,
    lang: ($("html").attr("lang") ?? "").trim(),
    viewport_content,
    zoom_blocked,
    skip_link: $('a[href^="#"]')
      .toArray()
      .some((a) => /skip/i.test(textOf(a))),
    heading_skip: headingSkip($),
    form_inputs: labels.total,
    form_inputs_labeled: labels.labeled,
    contact_inputs: contact.total,
    contact_inputs_typed: contact.typed,
    description_words: descriptionWords($),
    specs_present,
    faq_questions,
    faq_heading,
    variants: variantKinds($),
    video_present:
      $('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"], iframe[src*="loom"]').length > 0,
    contact_kinds,
    privacy_link: linkMatches($, /privacy/i),
    terms_link: linkMatches($, /\bterms\b|conditions/i),
    about_link: linkMatches($, /about( us)?\b|our story/i),
    payment_names: namesIn(text, $, PAYMENT_NAMES),
    card_marks: namesIn(text, $, CARD_MARKS),
    shipping_phrase: nodePhrase($, [
      /free (?:standard |express |two-day |2-day )?(?:shipping|delivery)[^.·|]{0,40}/i,
      /ships? free[^.·|]{0,24}/i,
      /(?:shipping|delivery) (?:costs?|fees?|is|from)\s*[$£€]\s*\d[^.·|]{0,16}/i,
      /flat[- ]rate (?:shipping|delivery)/i,
      /[$£€]\s*\d+(?:\.\d{2})? (?:shipping|delivery)/i,
      /(?:arrives|delivered|ships) (?:in|within|by) [^.·|]{1,24}/i,
    ]),
    shipping_mentioned: /shipping|delivery/i.test(text),
    returns_phrase: nodePhrase($, [
      /\d+[- ]day[^.·|]{0,24}returns?/i,
      /free returns/i,
      /easy returns/i,
      /returns? within \d+ days/i,
      /return policy/i,
      /refund policy/i,
    ]),
    returns_mentioned: /\breturns?\b|\brefunds?\b|exchanges?/i.test(text),
    plan_prices: new Set(plan.map((p) => normalize(p).toLowerCase())).size,
    ...reviewCount($, ld, ctx.testimonials),
    rating_near_title: ratingNearTitle($),
    text_rating: (() => {
      const m = text.match(/(\d(?:\.\d)?)\s*(?:out of|\/)\s*5\b/i);
      const v = m ? Number(m[1]) : NaN;
      return Number.isFinite(v) && v <= 5 ? v : null;
    })(),
    numbers_phrase: nodePhrase($, [/\d[\d,]*\+?\s*(?:customers|users|clients|companies|enterprises|years|countries)/i], 40),
    badge_labels: badgeLabels($),
    media_count: $("img, video").length + $("picture").toArray().filter((p) => $(p).find("img").length === 0).length,
    quote_count: Math.max($("blockquote").length, quoted, testimonialItems),
    client_logo_count: clientLogos($),
    press_phrases: [...press],
    case_studies: /case stud(?:y|ies)|customer stor(?:y|ies)|success stor(?:y|ies)/i.test(text),
    jsonld: ld,
    img_total: imgs.length,
    img_with_dims: imgs.filter((img) => (attr(img, "width") ?? "").trim() && (attr(img, "height") ?? "").trim()).length,
    img_lazy: imgs.filter((img) => (attr(img, "loading") ?? "").toLowerCase() === "lazy" || attr(img, "data-src") || attr(img, "data-srcset"))
      .length,
    responsive_images: $("img[srcset], picture source[srcset]").length,
    alt_described: describedImgs + describedSvgs,
    alt_total: meaningfulImgs.length + svgs.length,
    competing_cta_labels: [...competing],
    cta_tag: ctaNode ? ctaNode.name : null,
    custom_pricing: /(?:custom|contact(?: us)?(?: for)?|request(?: a)?|get(?: a)?) (?:pricing|price|quote)|pricing on request|call for (?:pricing|price)/i.test(
      lower,
    ),
    free_explicit: /free forever|free plan|start (?:for )?free|try (?:it )?free|free trial|no cost|complimentary|\$0\b/i.test(lower),
    price_has_amount: /[$£€¥₹]\s*\d|\d[\d,.]*\s*(?:usd|eur|gbp|cad|aud)\b/i.test(ctx.price),
    guarantee_phrase: nodePhrase($, [
      /\d+[- ]day[^.·|]{0,24}(?:guarantee|trial)/i,
      /money[- ]back[^.·|]{0,24}/i,
      /lifetime warranty/i,
      /\d+[- ]year warranty/i,
      /satisfaction guarantee[d]?/i,
      /\bguarantee[d]?\b/i,
      /\bwarranty\b/i,
    ]),
    trust_terms: [...new Set(ctx.trustWords.filter((w) => lower.includes(w)))],
  };
}
