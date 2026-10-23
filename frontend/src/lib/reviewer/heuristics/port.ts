import {
  attr,
  classMatches,
  descendants,
  elementsWithOwnString,
  hasAncestor,
  isAttrHidden,
  isElement,
  maxDepth,
  normalize,
  pageText,
  parentOf,
  stringsMatching,
  textOf,
  type CheerioAPI,
  type Element,
} from "./dom";

/* ─────────────────────────────────────────────────────────
 * HEURISTICS PORT — backend/heuristic.py from
 * github.com/aviju888/product-page-reviewer, function for
 * function, on cheerio instead of BeautifulSoup. Keys stay
 * snake_case so this reads side by side with the Python.
 *
 * Deliberate deviations (each one a bug or a bs4-ism):
 *  1. CSS selectors passed to find_all() (security badges, logos,
 *     badges, popups, form fields) always returned 0 in bs4,
 *     which reads them as tag names. Here they run as selectors.
 *  2. Text joins words with spaces; bs4's strip=True glued
 *     "Add" + "to cart" into "Addto cart" and missed the CTA.
 *  3. Text searches skip script/style/noscript/template, so
 *     JSON blobs and JS can't count as copy.
 *  4. span/div CTA candidates need a short label (<= 40 chars),
 *     so a wrapper with role="..." can't become the CTA text.
 *  5. A price taken from a [class*=price] container longer than
 *     40 chars is trimmed to its first amount.
 *  6. Popups and CTA-in-modal checks skip markup that is hidden
 *     by attributes (hidden, aria-hidden, display:none).
 *  7. JSON-LD: each script parses on its own, @graph is
 *     flattened and @type may be an array.
 *  8. cta_grouping also accepts the product name (the original
 *     only knew chocolate-shop words like "truffle").
 *  9. picture > img counts toward its gallery container.
 * 10. Unlabeled buttons/links accept aria-labelledby, title and
 *     an img alt as a name, like a screen reader would.
 * ───────────────────────────────────────────────────────── */

export type RawSiteType = "ecommerce" | "saas" | "b2b" | "service" | "generic";
export type RawPageType = "product" | "homepage" | "category" | "unknown";

export type Keywords = { product: string[]; cta: string[]; pricing: string[] };

/* ── summarize_structure ─────────────────────────────── */

export const STRUCTURE_CTA_TEXTS = [
  "add to cart", "add to bag", "buy now", "buy", "checkout", "order now", "shop now",
  "get started", "start now", "get started now", "try now", "try free", "sign up", "signup",
  "contact sales", "talk to sales", "schedule demo", "book demo", "request demo", "learn more",
  "download", "subscribe", "join now", "register", "create account", "free trial",
];

const PRICE_RE = /[$£€]\s*\d[\d,]*(?:\.\d{2})?/;

export type StructureInfo = {
  heading_hierarchy: string[];
  h1_count: number;
  has_subheadings: boolean;
  max_dom_depth: number;
  section_count: number;
  main_present: boolean;
  cta_grouping: boolean;
  cta_position: number | null;
  gallery_present: boolean;
  modals_with_cta: boolean;
};

function clickables($: CheerioAPI): Element[] {
  return $("button, a, input").toArray();
}

export function summarizeStructure($: CheerioAPI, productName = ""): StructureInfo {
  const heading_hierarchy: string[] = [];
  for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
    $(tag).each((_, el) => {
      const t = textOf(el);
      if (t) heading_hierarchy.push(`${tag}: ${t}`);
    });
  }

  const all = clickables($);
  let ctaNode: Element | null = null;
  outer: for (const ctaText of STRUCTURE_CTA_TEXTS) {
    for (const el of all) {
      const label = (attr(el, "value") || attr(el, "aria-label") || textOf(el)).toLowerCase();
      if (label.includes(ctaText)) {
        ctaNode = el;
        break outer;
      }
    }
  }

  let cta_grouping = false;
  if (ctaNode) {
    const parent = parentOf(ctaNode);
    if (parent) {
      const parentText = textOf(parent).toLowerCase();
      const hasPrice = PRICE_RE.test(parentText);
      const productKeywords = ["chocolate", "truffle", "box", "assorted", "product", "item"];
      const name = productName.trim().toLowerCase();
      const hasTitle = productKeywords.some((k) => parentText.includes(k)) || (name.length > 3 && parentText.includes(name));
      cta_grouping = hasPrice || hasTitle;
    }
  }
  const cta_position = ctaNode ? all.indexOf(ctaNode) : null;

  // galleries: more than one image sharing a container
  const containers = new Map<Element, number>();
  $("img").each((_, img) => {
    let parent = parentOf(img);
    if (parent?.name === "picture") parent = parentOf(parent);
    if (parent) containers.set(parent, (containers.get(parent) ?? 0) + 1);
  });
  const gallery_present = [...containers.values()].some((n) => n > 1);

  let modals_with_cta = false;
  for (const selector of ['[class*="modal"]', '[class*="popup"]', '[class*="overlay"]', '[role="dialog"]']) {
    for (const modal of $(selector).toArray().filter(isElement)) {
      if (isAttrHidden(modal)) continue;
      const text = textOf(modal).toLowerCase();
      if (STRUCTURE_CTA_TEXTS.some((c) => text.includes(c))) {
        modals_with_cta = true;
        break;
      }
    }
    if (modals_with_cta) break;
  }

  return {
    heading_hierarchy,
    h1_count: $("h1").length,
    has_subheadings: $("h2, h3").length > 0,
    max_dom_depth: maxDepth($.root()[0]),
    section_count: $("section").length,
    main_present: $("main").length > 0,
    cta_grouping,
    cta_position: cta_position === -1 ? null : cta_position,
    gallery_present,
    modals_with_cta,
  };
}

/* ── detect_site_type / detect_page_type ─────────────── */

export const SITE_KEYWORDS: Record<Exclude<RawSiteType, "generic">, string[]> = {
  ecommerce: ["add to cart", "shopping cart", "checkout", "buy now", "add to bag", "in stock", "out of stock", "quantity", "shipping", "delivery"],
  saas: ["get started", "free trial", "sign up", "login", "dashboard", "pricing", "per month", "per year", "subscription", "api", "integration"],
  b2b: ["enterprise", "contact sales", "schedule demo", "request quote", "solutions", "partners", "case study", "whitepaper", "roi", "implementation"],
  service: ["book now", "appointment", "consultation", "quote", "estimate", "contact us", "call now", "schedule", "service"],
};

function argmax<K extends string>(scores: Record<K, number>): K {
  // Python's max(dict, key=dict.get): the first key holding the max wins
  let best: K | null = null;
  for (const k of Object.keys(scores) as K[]) if (best === null || scores[k] > scores[best]) best = k;
  return best!;
}

export function detectSiteType(lowerText: string): { type: RawSiteType; scores: Record<string, number> } {
  const scores = {
    ecommerce: SITE_KEYWORDS.ecommerce.filter((k) => lowerText.includes(k)).length,
    saas: SITE_KEYWORDS.saas.filter((k) => lowerText.includes(k)).length,
    b2b: SITE_KEYWORDS.b2b.filter((k) => lowerText.includes(k)).length,
    service: SITE_KEYWORDS.service.filter((k) => lowerText.includes(k)).length,
  };
  const max = Math.max(...Object.values(scores));
  return { type: max > 0 ? argmax(scores) : "generic", scores };
}

export const PAGE_KEYWORDS = {
  product: [
    "add to cart", "buy now", "add to bag", "quantity", "size", "color", "variant",
    "product details", "specifications", "reviews", "rating", "price", "sale",
    "in stock", "out of stock", "shipping", "delivery", "returns", "warranty",
  ],
  homepage: [
    "welcome", "about us", "our story", "company", "team", "mission", "vision",
    "news", "blog", "press", "careers", "contact", "support", "help",
    "featured", "bestsellers", "new arrivals", "categories", "collections",
  ],
  category: [
    "filter", "sort", "results", "showing", "items", "products", "category",
    "brand", "price range", "clear filters", "refine", "view all",
  ],
};

export function detectPageType(lowerText: string): { type: RawPageType; scores: Record<string, number> } {
  const product = PAGE_KEYWORDS.product.filter((k) => lowerText.includes(k)).length;
  const homepage = PAGE_KEYWORDS.homepage.filter((k) => lowerText.includes(k)).length;
  const category = PAGE_KEYWORDS.category.filter((k) => lowerText.includes(k)).length;
  const scores = { product, homepage, category };
  if (Math.max(product, homepage, category) > 0) {
    const pageType = argmax(scores);
    if (product >= 4 && product >= homepage) return { type: "product", scores };
    if (homepage >= 3 && homepage > product) return { type: "homepage", scores };
    if (category >= 3 && category > product) return { type: "category", scores };
    return { type: pageType, scores };
  }
  return { type: "unknown", scores };
}

/* ── get_dynamic_keywords ────────────────────────────── */

const KEYWORD_SETS: Record<RawSiteType, Keywords> = {
  ecommerce: {
    product: ["product", "item", "goods", "merchandise", "inventory", "catalog"],
    cta: ["add to cart", "buy now", "purchase", "order now", "shop now", "add to bag"],
    pricing: ["price", "cost", "sale", "discount", "deal", "offer", "special"],
  },
  saas: {
    product: ["software", "platform", "tool", "service", "solution", "app", "system"],
    cta: ["get started", "try free", "sign up", "start trial", "demo", "learn more"],
    pricing: ["pricing", "plan", "subscription", "per month", "per year", "tier"],
  },
  b2b: {
    product: ["solution", "platform", "service", "system", "software", "tool", "technology"],
    cta: ["contact sales", "get quote", "schedule demo", "request info", "talk to sales"],
    pricing: ["pricing", "investment", "cost", "quote", "estimate", "custom pricing"],
  },
  service: {
    product: ["service", "consultation", "support", "help", "solution", "expertise"],
    cta: ["book now", "contact us", "get quote", "call now", "schedule", "appointment"],
    pricing: ["price", "cost", "rate", "fee", "investment", "quote", "estimate"],
  },
  generic: {
    product: ["product", "item", "service", "solution", "offering", "option"],
    cta: ["learn more", "get started", "contact us", "find out more", "discover"],
    pricing: ["price", "cost", "pricing", "investment", "value", "rate"],
  },
};

export function getDynamicKeywords(siteType: RawSiteType): Keywords {
  return KEYWORD_SETS[siteType] ?? KEYWORD_SETS.generic;
}

/* ── extract_basic_info ──────────────────────────────── */

const UI_WORDS = ["cart", "checkout", "login", "sign in", "menu", "navigation", "your"];

export function pageTitle($: CheerioAPI): string {
  const head = $("head > title").first();
  if (head.length) return head.text().trim();
  const any = $("title")
    .toArray()
    .find((el) => !hasAncestor(el, ["svg"]));
  return any ? $(any).text().trim() : "";
}

export function extractBasicInfo($: CheerioAPI, keywords: Keywords): { title: string; h1: string } {
  const title = pageTitle($);
  const h1s = $("h1").toArray();
  const productKeywords = keywords.product;
  let h1 = "";

  for (const el of h1s) {
    const t = textOf(el);
    if (productKeywords.some((k) => t.toLowerCase().includes(k))) {
      h1 = t;
      break;
    }
  }
  if (!h1) {
    for (const el of h1s) {
      const t = textOf(el);
      if (t.length > 5 && !UI_WORDS.some((w) => t.toLowerCase().includes(w))) {
        h1 = t;
        break;
      }
    }
  }
  if (!h1) {
    outer: for (const tag of ["h2", "h3", "h4", "h5", "h6"]) {
      for (const el of $(tag).toArray()) {
        const t = textOf(el);
        if (productKeywords.some((k) => t.toLowerCase().includes(k)) && t.length > 5) {
          h1 = t;
          break outer;
        }
      }
    }
  }
  if (!h1) {
    outer: for (const tag of ["h2", "h3", "h4", "h5", "h6"]) {
      for (const el of $(tag).toArray()) {
        const t = textOf(el);
        if (t.length > 10 && !UI_WORDS.some((w) => t.toLowerCase().includes(w))) {
          h1 = t;
          break outer;
        }
      }
    }
  }
  if (!h1 && h1s.length) h1 = textOf(h1s[0]);
  return { title, h1 };
}

/* ── extract_pricing_info ────────────────────────────── */

const CUR = "[$£€¥₹]";
const PER = "(?:per\\s+(?:minute|month|year|day|hour|user|seat|license|unit)|/min|/mo|/yr|/day|/hr|/user|/seat)";
const FREE_RE_SRC = "(?:free|no cost|complimentary|gratis|free forever|free plan|get for free|start free|try free)\\b";

const PRICE_PATTERNS = [
  `${CUR}\\s*\\d[\\d,]*(?:\\.\\d{2})?\\s*${PER}`,
  `${CUR}\\s*\\d[\\d,]*(?:\\.\\d{2})?`,
  `${PER}\\s*${CUR}\\s*\\d[\\d,]*(?:\\.\\d{2})?`,
  FREE_RE_SRC,
  "(?:custom|contact|quote|estimate|call|negotiable)\\s*(?:pricing|price|cost)",
  `${CUR}\\s*\\d[\\d,]*(?:\\.\\d{2})?\\s*[-–—]\\s*${CUR}\\s*\\d[\\d,]*(?:\\.\\d{2})?`,
];

export function extractPricingInfo($: CheerioAPI, text: string): { price: string; is_free_product: boolean } {
  let price = "";
  let is_free_product = false;

  for (const selector of [".price", "[class*=price]", "[id*=price]", "[data-price]"]) {
    const el = $(selector).first()[0];
    const t = el ? textOf(el) : "";
    if (t) {
      if (t.length > 40) {
        const amount = t.match(new RegExp(`${CUR}\\s*\\d[\\d,]*(?:\\.\\d{2})?`));
        price = amount ? amount[0] : t.slice(0, 40);
      } else {
        price = t;
      }
      break;
    }
  }

  if (!price) {
    for (const pattern of PRICE_PATTERNS) {
      const matches = text.match(new RegExp(pattern, "gi"));
      if (!matches) continue;
      for (const match of matches) {
        if (new RegExp(`^${FREE_RE_SRC}`, "i").test(match)) {
          price = match.trim();
          is_free_product = true;
          break;
        }
        const cleaned = match.replace(/(\d)(per|\/min|\/mo|\/yr|\/day|\/hr)/g, "$1 $2");
        const num = match.replace(/[^\d.]/g, "");
        const value = num === "" ? NaN : Number(num);
        if (Number.isFinite(value) && value >= 0.01) {
          price = cleaned.trim();
          break;
        }
      }
      if (price) break;
    }
  }
  return { price, is_free_product };
}

/* ── extract_cta_info ────────────────────────────────── */

export const CTA_EXTRA = [
  "learn more", "find out more", "discover", "explore", "view details", "see more",
  "download", "subscribe", "join now", "register", "create account", "free trial",
  "start free", "get demo", "watch demo", "view demo", "try it free", "test drive",
  "add to cart", "add to bag", "buy now", "purchase", "order now", "shop now",
  "add to basket", "add to cart", "buy", "checkout", "proceed to checkout",
  "add to wishlist", "save for later", "quick buy", "one-click buy",
];

export const CTA_EXCLUDE = [
  "skip to", "skip", "navigation", "menu", "breadcrumb", "breadcrumbs",
  "open media", "close", "modal", "popup", "overlay", "accessibility",
  "screen reader", "sr-only", "visually hidden", "skip to content",
  "skip to main", "skip to product", "skip to navigation",
];

const NEAR_PRICE_PATTERNS = [
  new RegExp(`[$£€]\\s*\\d[\\d,]*(?:\\.\\d{2})?\\s*${PER}`, "i"),
  /[$£€]\d[\d,]*(?:\.\d{2})?/i,
  /[$£€]\s*\d[\d,]*(?:\.\d{2})?/i,
  new RegExp(`${PER}\\s*[$£€]\\s*\\d[\\d,]*(?:\\.\\d{2})?`, "i"),
];

export type CtaInfo = {
  cta: string | null;
  price_near_cta: boolean;
  cta_above_fold: boolean;
  shipping_returns_near_cta: boolean;
};

export function ctaTexts(keywords: Keywords): string[] {
  return [...keywords.cta, ...CTA_EXTRA];
}

/** The node extract_cta_info measures position and proximity from. */
export function findCtaNode($: CheerioAPI, keywords: Keywords): Element | null {
  const all = clickables($);
  for (const ctaText of ctaTexts(keywords)) {
    for (const el of all) {
      const label = (attr(el, "value") || attr(el, "aria-label") || textOf(el)).toLowerCase();
      if (CTA_EXCLUDE.some((p) => label.includes(p))) continue;
      if (label.includes(ctaText)) return el;
    }
  }
  return null;
}

function ctaLabel(el: Element): string {
  return (attr(el, "value") || attr(el, "aria-label") || attr(el, "title") || textOf(el)).toLowerCase();
}

function ctaDataText(el: Element): string {
  return (attr(el, "data-text") || attr(el, "data-label") || attr(el, "data-cta") || "").toLowerCase();
}

/** Fields the port adds next to the original dict (the original computed them, then dropped them). */
export type CtaExtra = { cta_from_span: boolean; cta_index: number | null; clickable_count: number };

export function extractCtaInfo($: CheerioAPI, keywords: Keywords): CtaInfo & CtaExtra {
  let addToCart: string | null = null;
  let ctaFromSpan = false;
  const texts = ctaTexts(keywords);
  const buttons = clickables($);

  // the Python recomputed every label once per keyword; same result, computed once
  const buttonRows = buttons
    .map((el) => ({ el, label: ctaLabel(el), data: ctaDataText(el) }))
    .filter((r) => !CTA_EXCLUDE.some((p) => r.label.includes(p)));
  const spanRows = $("span, div")
    .toArray()
    .map((el) => ({ el, label: ctaLabel(el), data: ctaDataText(el) }))
    .filter((r) => {
      if (r.label.length > 40) return false; // deviation 4
      if (CTA_EXCLUDE.some((p) => r.label.includes(p))) return false;
      const interactive = ["onclick", "data-action", "role"].some((a) => !!attr(r.el, a));
      return interactive || hasAncestor(r.el, ["form"]) || hasAncestor(r.el, ["button", "a"]);
    });

  for (const ctaText of texts) {
    const hit = buttonRows.find((r) => r.label.includes(ctaText) || r.data.includes(ctaText));
    if (hit) {
      addToCart = textOf(hit.el) || attr(hit.el, "value") || attr(hit.el, "aria-label") || null;
      if (addToCart) break;
    }
    const spanHit = spanRows.find((r) => r.label.includes(ctaText) || r.data.includes(ctaText));
    if (spanHit) {
      addToCart = textOf(spanHit.el) || attr(spanHit.el, "value") || attr(spanHit.el, "aria-label") || null;
      ctaFromSpan = true;
      if (addToCart) break;
    }
  }

  const ctaNode = findCtaNode($, keywords);

  let price_near_cta = false;
  if (ctaNode) {
    const p1 = parentOf(ctaNode);
    const p2 = p1 ? parentOf(p1) : null;
    const p3 = p2 ? parentOf(p2) : null;
    for (const scope of [ctaNode, p1, p2, p3]) {
      if (!scope) continue;
      const t = textOf(scope);
      if (NEAR_PRICE_PATTERNS.some((re) => re.test(t))) {
        price_near_cta = true;
        break;
      }
    }
    if (!price_near_cta) {
      let current: Element | null = ctaNode;
      for (let level = 0; level < 6 && !price_near_cta; level += 1) {
        const parent: Element | null = current ? parentOf(current) : null;
        if (!parent) break;
        for (const sib of descendants(parent)) {
          if (!["div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(sib.name)) continue;
          const t = textOf(sib);
          if (NEAR_PRICE_PATTERNS.some((re) => re.test(t))) {
            price_near_cta = true;
            break;
          }
        }
        current = parent;
      }
    }
  }

  let cta_above_fold = false;
  const idx = ctaNode ? buttons.indexOf(ctaNode) : -1;
  if (ctaNode) cta_above_fold = idx >= 0 && idx <= Math.max(5, Math.floor(0.2 * buttons.length));

  let shipping_returns_near_cta = false;
  if (ctaNode) {
    const scope = parentOf(ctaNode) ?? ctaNode;
    const t = textOf(scope).toLowerCase();
    shipping_returns_near_cta = ["free shipping", "shipping", "delivery", "returns", "refund"].some((w) => t.includes(w));
  }

  return {
    cta: addToCart,
    price_near_cta,
    cta_above_fold,
    shipping_returns_near_cta,
    cta_from_span: ctaFromSpan,
    cta_index: idx >= 0 ? idx : null,
    clickable_count: buttons.length,
  };
}

/* ── extract_image_info ──────────────────────────────── */

export function extractImageInfo($: CheerioAPI): { image_count: number; images_missing_alt: number; alt_coverage: number } {
  const imgs = $("img").toArray();
  const svgs = $("svg")
    .toArray()
    .filter((svg) => {
      const classes = (attr(svg, "class") ?? "").split(/\s+/);
      return !["icon", "logo", "button", "arrow", "chevron"].some((c) => classes.includes(c));
    });
  const cssImages = $("[style]")
    .toArray()
    .filter((el) => /background.*image/i.test(attr(el, "style") ?? ""));
  const dataImages = $("[data-src]")
    .toArray()
    .filter((el) => /\.(jpg|jpeg|png|gif|webp|svg)/i.test(attr(el, "data-src") ?? ""));
  const image_count =
    imgs.length + svgs.length + cssImages.length + dataImages.length + $("picture").length + $("video").length + $("canvas").length;

  const withAlt = [...imgs, ...svgs];
  let missing = 0;
  for (const el of withAlt) {
    const alt = attr(el, "alt") || attr(el, "aria-label") || "";
    if (!alt.trim()) missing += 1;
  }
  const alt_coverage = withAlt.length > 0 ? Math.round(((withAlt.length - missing) / withAlt.length) * 100) / 100 : 0;
  return { image_count, images_missing_alt: missing, alt_coverage };
}

/* ── extract_testimonial_info ────────────────────────── */

const TESTIMONIAL_CLASS = /testimonial|customer|review|quote|feedback|endorsement/i;

export type JsonLdFacts = {
  average_rating: number | null;
  review_count: number | null;
  types: string[];
  /** top-level Product / ProductGroup objects (one means a product page) */
  product_count: number;
  has_offer_price: boolean;
  has_aggregate_rating: boolean;
};

function flattenLd(data: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      out.push(o);
      if (Array.isArray(o["@graph"])) (o["@graph"] as unknown[]).forEach(visit);
    }
  };
  visit(data);
  return out;
}

function typesOf(o: Record<string, unknown>): string[] {
  const t = o["@type"];
  return Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
}

export function readJsonLd($: CheerioAPI): JsonLdFacts {
  let average_rating: number | null = null;
  let review_count: number | null = null;
  let has_offer_price = false;
  let has_aggregate_rating = false;
  let product_count = 0;
  const types: string[] = [];

  $('script[type="application/ld+json"]').each((_, script) => {
    const raw = $(script).text();
    if (!raw.trim()) return;
    let data: unknown;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      return;
    }
    for (const obj of flattenLd(data)) {
      const ts = typesOf(obj);
      types.push(...ts);
      if (ts.some((t) => t === "Product" || t === "ProductGroup")) product_count += 1;
      const ar = obj.aggregateRating as Record<string, unknown> | undefined;
      if (ar && typeof ar === "object" && "ratingValue" in ar) {
        const v = Number(String(ar.ratingValue).trim());
        if (Number.isFinite(v)) average_rating = v;
        has_aggregate_rating = true;
        const rc = ar.reviewCount ?? ar.ratingCount;
        if (rc !== undefined) {
          const n = parseInt(String(rc).trim(), 10);
          if (Number.isFinite(n)) review_count = n;
        }
      }
      if (ts.some((t) => ["Product", "Service", "Organization", "LocalBusiness"].includes(t))) {
        if (Array.isArray(obj.review)) review_count = Math.max(review_count ?? 0, obj.review.length);
      }
      const offers = obj.offers;
      const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];
      for (const off of offerList) {
        if (off && typeof off === "object") {
          const o = off as Record<string, unknown>;
          if (o.price !== undefined || o.lowPrice !== undefined) has_offer_price = true;
        }
      }
    }
  });
  return { average_rating, review_count, types, product_count, has_offer_price, has_aggregate_rating };
}

export type TestimonialInfo = { testimonials: number; has_reviews_or_ratings: boolean; average_rating: number | null };

export function extractTestimonialInfo($: CheerioAPI, ld: JsonLdFacts): TestimonialInfo {
  let testimonials = 0;

  const containers = $("div, section, article")
    .toArray()
    .filter((el) => classMatches(el, TESTIMONIAL_CLASS));
  for (const c of containers) {
    testimonials += descendants(c).filter(
      (d) => ["div", "article", "li", "blockquote", "p"].includes(d.name) && classMatches(d, TESTIMONIAL_CLASS),
    ).length;
  }

  if (testimonials === 0) testimonials = stringsMatching($, /"[^"]{20,}"/i).length;

  if (testimonials === 0) {
    const indicators = stringsMatching($, /out of 5|based on \d+ reviews|customer review|reviewed by|\d+\s*stars?|\d+\s*★/i);
    if (indicators.length) {
      for (const s of indicators) {
        const m = s.match(/based on (\d+) reviews/i);
        if (m) {
          testimonials = parseInt(m[1], 10);
          break;
        }
      }
      if (testimonials === 0) testimonials = indicators.length;
    }
  }

  if (testimonials === 0) {
    testimonials = stringsMatching(
      $,
      /(CEO|Founder|Manager|Director|President|VP|CTO|CMO|Marketing|Sales|Operations|Owner|Principal|Lead|Head|Chief)/i,
    ).length;
  }

  if (testimonials === 0) {
    testimonials = stringsMatching(
      $,
      /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}/,
    ).length;
  }

  if (testimonials === 0) {
    for (const s of stringsMatching($, /(?:loved by|used by|trusted by|recommended by|chosen by)\s+\d+/i)) {
      const m = s.match(/(\d+)/);
      if (m) {
        testimonials += parseInt(m[1], 10);
        break;
      }
    }
  }

  const text = pageText($);
  const lower = text.toLowerCase();
  const stars_present = text.includes("★") || lower.includes("rating") || lower.includes("reviews");
  const has_reviews_or_ratings = Boolean(testimonials || stars_present);

  if (ld.review_count && ld.review_count > 0) testimonials = Math.max(testimonials, ld.review_count);
  const based = text.match(/based on\s*(\d+)\s*reviews/i);
  if (based) testimonials = Math.max(testimonials, parseInt(based[1], 10));

  return { testimonials, has_reviews_or_ratings, average_rating: ld.average_rating };
}

/* ── extract_trust_info ──────────────────────────────── */

export type TrustIndicators = {
  security_badges: number;
  compliance_mentions: number;
  effective_trust_badges: number;
  guarantees: number;
  client_logos: number;
  trust_badges: number;
  compliance: number;
  awards: number;
  numbers: number;
  payment_integrations: number;
  payment_buttons: number;
};

export type TrustInfo = {
  security_badges: number;
  guarantees: number;
  trust_text_hits: number;
  client_logos: number;
  trust_badges: number;
  social_proof: number;
  trust_indicators: TrustIndicators;
};

export const TRUST_WORDS = [
  "guarantee", "warranty", "refund", "money back", "secure", "ssl", "trusted by", "compliance",
  "fcc", "gdpr", "soc", "iso", "certified", "secure", "encrypted", "privacy", "data protection",
  "leading", "enterprise", "fortune", "inc 500", "award", "recognized", "verified",
];

export const PAYMENT_RE = /shop pay|paypal|stripe|square|apple pay|google pay|amazon pay|klarna|afterpay|sezzle/i;

export function extractTrustInfo($: CheerioAPI, lowerText: string): TrustInfo {
  const security_badges = $('img[alt*="secure"], [class*="security"], [class*="ssl"]').length;
  const guarantees = stringsMatching($, /guarantee|warranty|refund|money back/i).length;
  const trust_text_hits = TRUST_WORDS.filter((w) => lowerText.includes(w)).length;
  const payment_integrations = stringsMatching($, PAYMENT_RE).length;
  const payment_buttons = elementsWithOwnString($, "button, a", /buy with|pay with|checkout with/i).length;
  const client_logos = $('img[alt*="logo"], [class*="logo"], [class*="client"], [class*="partner"]').length;
  const trust_badges = $('img[alt*="badge"], [class*="badge"], [class*="certification"]').length;
  const social_proof = stringsMatching($, /trusted by|used by|loved by|customers|clients|users|partners|enterprises|companies/i).length;
  const visual_security_badges = $('img[alt*="secure"], [class*="security"], [class*="ssl"], [class*="certified"]').length;
  const compliance_mentions = stringsMatching($, /gdpr|hipaa|sox|pci|iso\s*\d+|soc\s*\d+|fcc|compliant|certified/i).length;
  const payment_trust_score = Math.min(payment_integrations + payment_buttons, 3);
  const effective_trust_badges = Math.max(visual_security_badges, Math.min(compliance_mentions, 3), payment_trust_score);

  return {
    security_badges,
    guarantees,
    trust_text_hits,
    client_logos,
    trust_badges,
    social_proof,
    trust_indicators: {
      security_badges: visual_security_badges,
      compliance_mentions,
      effective_trust_badges,
      guarantees: stringsMatching($, /guarantee|warranty|refund|money back|satisfaction|risk.free/i).length,
      client_logos: $('img[alt*="logo"], [class*="logo"], [class*="client"], [class*="partner"], [class*="customer"]').length,
      trust_badges: $('img[alt*="badge"], [class*="badge"], [class*="certification"], [class*="award"]').length,
      compliance: compliance_mentions,
      awards: stringsMatching($, /award|winner|recognized|featured|top|best|leading/i).length,
      numbers: stringsMatching($, /\d+\+?\s*(?:customers|users|clients|companies|enterprises|years|countries)/i).length,
      payment_integrations,
      payment_buttons,
    },
  };
}

/* ── extract_technical_info ──────────────────────────── */

export type TechnicalInfo = {
  form_count: number;
  form_fields: number;
  popup_count: number;
  headings: Record<string, number>;
  viewport_present: boolean;
  meta_title_len: number;
  meta_description_len: number;
  og_tags_present: boolean;
  canonical_present: boolean;
  breadcrumbs_present: boolean;
  related_products_present: boolean;
  has_search: boolean;
  html_bytes: number;
  external_script_count: number;
  inline_script_count: number;
  a11y_unlabeled_buttons: number;
  a11y_unlabeled_links: number;
};

/** Accessible-name approximation (deviation 10). */
export function hasAccessibleName($: CheerioAPI, el: Element): boolean {
  if (textOf(el)) return true;
  if ((attr(el, "aria-label") ?? "").trim()) return true;
  if ((attr(el, "title") ?? "").trim()) return true;
  const labelledBy = attr(el, "aria-labelledby");
  if (labelledBy && labelledBy.split(/\s+/).some((id) => textOf($(`[id="${id.replace(/"/g, "")}"]`)[0]))) return true;
  if ($(el).find("img[alt]").toArray().some((img) => (attr(img, "alt") ?? "").trim())) return true;
  if ((attr(el, "value") ?? "").trim()) return true;
  return false;
}

export function extractTechnicalInfo($: CheerioAPI, html: string): TechnicalInfo {
  const forms = $("form");
  const popups = $('[class*="modal"], [class*="popup"], [class*="overlay"]')
    .toArray()
    .filter((el) => !isAttrHidden(el));
  const form_fields = forms.find("input, select, textarea").length;

  const headings: Record<string, number> = {};
  for (let i = 1; i <= 6; i += 1) headings[`h${i}_count`] = $(`h${i}`).length;

  const metaDesc = $('meta[name="description" i]').first();
  const metaDescContent = (metaDesc.attr("content") ?? "").trim();
  const title = pageTitle($);

  const scripts = $("script").toArray();
  const external = scripts.filter((s) => !!attr(s, "src")).length;

  return {
    form_count: forms.length,
    form_fields,
    popup_count: popups.length,
    headings,
    viewport_present: $('meta[name="viewport" i]').length > 0,
    meta_title_len: title.length,
    meta_description_len: metaDescContent.length,
    og_tags_present: $('meta[property="og:title"], meta[property="og:description"]').length > 0,
    canonical_present: $('link[rel~="canonical"]').length > 0,
    breadcrumbs_present:
      $('[aria-label*="breadcrumb" i], nav.breadcrumb, .breadcrumb, [class*="breadcrumb" i], [itemtype*="BreadcrumbList"]').length > 0,
    related_products_present: $('[class*="related" i], [id*="related" i], [data-section*="related" i]').length > 0,
    has_search: $('input[type="search"], form[role="search"], [role="search"]').length > 0,
    html_bytes: new TextEncoder().encode(html).length,
    external_script_count: external,
    inline_script_count: scripts.length - external,
    a11y_unlabeled_buttons: $("button")
      .toArray()
      .filter((b) => !hasAccessibleName($, b)).length,
    a11y_unlabeled_links: $("a")
      .toArray()
      .filter((a) => !hasAccessibleName($, a)).length,
  };
}

/* ── run_heuristics: the merged dict ─────────────────── */

export type HeuristicsData = {
  site_type: RawSiteType;
  page_type: RawPageType;
  title: string;
  h1: string;
  price: string;
  is_free_product: boolean;
  image_count: number;
  images_missing_alt: number;
  alt_coverage: number;
} & CtaInfo &
  CtaExtra &
  TestimonialInfo &
  TrustInfo &
  TechnicalInfo &
  StructureInfo;

export { normalize };
