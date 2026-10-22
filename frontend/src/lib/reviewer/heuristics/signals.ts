import type { BoxKind, CategoryId, Signal, SignalStatus } from "../types";
import type { ExtraFacts, RenderedFacts } from "./extras";
import type { HeuristicsData } from "./port";
import { words } from "./dom";

/* ─────────────────────────────────────────────────────────
 * SIGNALS — the heuristics normalized into individual checks.
 * Each check reads the ported facts (d), the rebuild's extra
 * facts (x) and, when a browser rendered the page, real
 * positions (r). Evidence quotes this page; fixes say what to
 * change. Weights are 1..3; score.ts adapts them per site and
 * page type.
 * ───────────────────────────────────────────────────────── */

export type SignalContext = { d: HeuristicsData; x: ExtraFacts; r: RenderedFacts | null };

type Outcome = { status: SignalStatus; evidence?: string; fix?: string };

type Def = {
  id: string;
  category: CategoryId;
  label: string;
  weight: 1 | 2 | 3;
  fix: string;
  box?: BoxKind;
  /** null drops the check (it can't be measured for this page) */
  run: (c: SignalContext) => Outcome | null;
};

const pass = (evidence?: string): Outcome => ({ status: "pass", evidence });
const warn = (evidence?: string): Outcome => ({ status: "warn", evidence });
const fail = (evidence?: string): Outcome => ({ status: "fail", evidence });

const n = (v: number) => v.toLocaleString("en-US");
const plural = (k: number, one: string, many = `${one}s`) => (k === 1 ? one : many);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
function clip(s: string, max = 40): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
const q = (s: string, max = 40) => `“${clip(s, max)}”`;
function kb(bytes: number): string {
  return bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

const STOP = new Set(["the", "and", "for", "with", "you", "your", "our", "buy", "shop", "from", "new", "best", "this", "that", "all"]);
function tokens(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)));
}
/** does the heading name something the title also names? */
function sharesWords(a: string, b: string): boolean {
  const tb = tokens(b);
  return [...tokens(a)].some((w) => tb.has(w));
}

const SPECIFIC_CTA =
  /add to (cart|bag|basket)|\bbuy\b|\border\b|checkout|pre-?order|subscribe|get started|start (free|your|now|trial)|free trial|try (it )?free|sign up|\bbook\b|schedule|request|contact sales|talk to sales|get (a )?quote|download|\bjoin\b|reserve|create account|register/i;
const GENERIC_CTA = /learn more|find out more|discover|explore|view details|see more|read more|click here|more info|shop now|see details/i;

const DEFS: Def[] = [
  /* ── CTA ─────────────────────────────────────────── */
  {
    id: "cta-found",
    category: "cta",
    label: "Primary button found",
    weight: 3,
    box: "cta",
    fix: "Add one clear primary button, like “Add to cart”, right beside the price.",
    run: ({ d }) => (d.cta ? pass(`Found ${q(d.cta)}`) : fail("No buy or signup button found")),
  },
  {
    id: "cta-above-fold",
    category: "cta",
    label: "Button visible without scrolling",
    weight: 3,
    box: "cta",
    fix: "Move the primary button into the first screen, next to the product name and price.",
    run: ({ d, r }) => {
      const box = r?.boxes.find((b) => b.kind === "cta" && b.primary) ?? r?.boxes.find((b) => b.kind === "cta");
      if (r && box) {
        const fold = r.viewportHeight;
        const top = Math.round(box.y);
        if (box.y + box.h <= fold) return pass(`Sits at ${n(top)}px, inside the first ${n(fold)}px`);
        if (box.y < fold * 1.5) return warn(`Starts at ${n(top)}px, just under the ${n(fold)}px fold`);
        return fail(`Sits at ${n(top)}px, ${(box.y / fold).toFixed(1)} screens down`);
      }
      if (!d.cta) return fail("No primary button to place");
      const pos = d.cta_index !== null ? `Clickable ${d.cta_index + 1} of ${d.clickable_count}` : "Position unknown";
      return d.cta_above_fold ? pass(`${pos}, early in the page`) : fail(`${pos}, late in the page`);
    },
  },
  {
    id: "cta-specific-label",
    category: "cta",
    label: "Button says what happens",
    weight: 2,
    box: "cta",
    fix: "Use a verb and an outcome: “Add to cart”, “Start free trial”, “Book a demo”.",
    run: ({ d }) => {
      if (!d.cta) return fail("No button label to read");
      if (SPECIFIC_CTA.test(d.cta) && !GENERIC_CTA.test(d.cta)) return pass(`${q(d.cta)} names the action`);
      return warn(`${q(d.cta)} doesn't say what happens next`);
    },
  },
  {
    id: "cta-label-length",
    category: "cta",
    label: "Short button label",
    weight: 1,
    fix: "Keep the button label to four words or fewer.",
    run: ({ d }) => {
      if (!d.cta) return fail("No button label");
      const w = words(d.cta);
      if (w <= 4) return pass(`${w} ${plural(w, "word")}`);
      return w <= 6 ? warn(`${w} words`) : fail(`${w} words`);
    },
  },
  {
    id: "cta-grouped",
    category: "cta",
    label: "Button grouped with price and name",
    weight: 2,
    box: "cta",
    fix: "Put the product name, price and button in one buy box.",
    run: ({ d }) => {
      if (!d.cta) return fail("No button to group");
      return d.cta_grouping ? pass("Shares a container with the price or name") : warn("Sits apart from the price and product name");
    },
  },
  {
    id: "cta-competing",
    category: "cta",
    label: "Few competing actions",
    weight: 1,
    fix: "Keep one primary action. Turn the rest into quiet secondary links.",
    run: ({ x }) => {
      const k = x.competing_cta_labels.length;
      const sample = x.competing_cta_labels.slice(0, 3).map((l) => q(l, 18)).join(", ");
      if (k <= 3) return pass(k === 0 ? "No competing actions" : `${k} distinct action ${plural(k, "label")}`);
      return k <= 6 ? warn(`${k} different action labels, like ${sample}`) : fail(`${k} different action labels, like ${sample}`);
    },
  },
  {
    id: "cta-real-button",
    category: "cta",
    label: "Primary action is a real button",
    weight: 1,
    fix: "Use a <button> or a link so keyboards and screen readers can reach it.",
    run: ({ d, x }) => {
      if (!d.cta) return fail("No primary action");
      if (d.cta_from_span) return warn("A clickable div or span, not a button");
      return pass(x.cta_tag === "a" ? "A link with an address" : x.cta_tag === "input" ? "A submit input" : "A real <button> element");
    },
  },
  {
    id: "cta-no-modal",
    category: "cta",
    label: "No action hidden in a popup",
    weight: 1,
    fix: "Keep the main action on the page itself, not inside an overlay.",
    run: ({ d }) => (d.modals_with_cta ? warn("A popup holds an action button") : pass("No popup holds an action")),
  },
  {
    id: "cta-forms",
    category: "cta",
    label: "Few forms competing for input",
    weight: 1,
    box: "form",
    fix: "Cut forms that pull focus from buying, like extra newsletter boxes.",
    run: ({ d }) => {
      const f = d.form_count;
      if (f <= 3) return pass(f === 0 ? "No forms" : `${f} ${plural(f, "form")}`);
      return f <= 5 ? warn(`${f} forms`) : fail(`${f} forms`);
    },
  },
  {
    id: "cta-delivery",
    category: "cta",
    label: "Delivery or returns by the button",
    weight: 2,
    box: "cta",
    fix: "Add one line under the button with the delivery time and return window.",
    run: ({ d }) => {
      if (!d.cta) return fail("No button to check around");
      return d.shipping_returns_near_cta ? pass(`Delivery or returns info sits by ${q(d.cta, 24)}`) : fail("No delivery or returns line near the button");
    },
  },

  /* ── Pricing ─────────────────────────────────────── */
  {
    id: "price-found",
    category: "pricing",
    label: "Price shown",
    weight: 3,
    box: "price",
    fix: "Show the price in the buy box. Hidden prices send shoppers off to find them elsewhere.",
    run: ({ d, x }) => {
      if (d.price && x.price_has_amount) return pass(clip(d.price, 32));
      if (d.is_free_product && x.free_explicit) return pass("Free plan stated");
      if (x.custom_pricing) return warn("Pricing on request");
      if (d.is_free_product) return warn(`Only found the word ${q(d.price, 16)}`);
      if (d.price) return warn(`Found ${q(d.price, 24)} without an amount`);
      return fail("No price found");
    },
  },
  {
    id: "price-near-cta",
    category: "pricing",
    label: "Price next to the button",
    weight: 3,
    box: "price",
    fix: "Place the price directly above the primary button.",
    run: ({ d }) => {
      if (!d.cta) return fail("No button to sit next to");
      if (d.price_near_cta) return pass(`Price sits near ${q(d.cta, 24)}`);
      if (!d.price) return fail("No price on the page");
      return fail("Price is far from the button");
    },
  },
  {
    id: "price-currency",
    category: "pricing",
    label: "Price has a currency",
    weight: 1,
    box: "price",
    fix: "Write the currency symbol with the amount.",
    run: ({ d }) => {
      if (!d.price) return fail("No price to read");
      if (/[$£€¥₹]|\b(usd|eur|gbp|cad|aud)\b/i.test(d.price)) return pass(`Shown as ${q(d.price, 24)}`);
      if (d.is_free_product) return pass("Free, no currency needed");
      return warn(`${q(d.price, 24)} has no currency`);
    },
  },
  {
    id: "price-payment-options",
    category: "pricing",
    label: "Payment options listed",
    weight: 1,
    fix: "List accepted wallets and pay later options near checkout.",
    run: ({ x }) => (x.payment_names.length ? pass(x.payment_names.slice(0, 3).join(", ")) : warn("No wallets or pay later options")),
  },
  {
    id: "price-shipping-cost",
    category: "pricing",
    label: "Shipping cost stated",
    weight: 2,
    fix: "State the shipping cost, or the order size that ships free.",
    run: ({ x }) => {
      if (x.shipping_phrase) return pass(cap(x.shipping_phrase));
      return x.shipping_mentioned ? warn("Mentions shipping without a cost or time") : fail("No shipping info");
    },
  },
  {
    id: "price-plans",
    category: "pricing",
    label: "Plans compared",
    weight: 2,
    fix: "Show plans side by side with what each one includes.",
    run: ({ x }) => {
      if (x.plan_prices >= 2) return pass(`${x.plan_prices} plan prices side by side`);
      return warn(x.plan_prices === 1 ? "One plan price, nothing to compare" : "No plan prices found");
    },
  },

  /* ── Trust ───────────────────────────────────────── */
  {
    id: "trust-guarantee",
    category: "trust",
    label: "Guarantee or warranty",
    weight: 2,
    box: "trust",
    fix: "State the guarantee in plain words near the button.",
    run: ({ d, x }) => {
      const g = d.trust_indicators.guarantees;
      if (g > 0) return pass(x.guarantee_phrase ? cap(x.guarantee_phrase) : `${g} ${plural(g, "mention")}`);
      return fail("No guarantee, warranty or refund promise");
    },
  },
  {
    id: "trust-returns",
    category: "trust",
    label: "Returns policy stated",
    weight: 2,
    box: "trust",
    fix: "Link the returns policy from the buy box and name the return window.",
    run: ({ x }) => {
      if (x.returns_phrase) return pass(cap(x.returns_phrase));
      return x.returns_mentioned ? warn("Mentions returns without terms") : fail("No returns info");
    },
  },
  {
    id: "trust-security",
    category: "trust",
    label: "Security or payment marks",
    weight: 2,
    box: "trust",
    fix: "Show the payment marks you accept and a short secure checkout note.",
    run: ({ d, x }) => {
      const marks = [...x.payment_names, ...x.card_marks];
      if (marks.length) return pass(`Payment marks: ${marks.slice(0, 3).join(", ")}`);
      if (d.trust_indicators.effective_trust_badges > 0) return pass("Security or compliance marks shown");
      return warn("No security, compliance or payment marks");
    },
  },
  {
    id: "trust-language",
    category: "trust",
    label: "Reassuring copy",
    weight: 1,
    fix: "Answer the risk question in the copy: warranty, secure payment, easy returns.",
    run: ({ x }) => {
      const t = x.trust_terms;
      if (t.length >= 3) return pass(`${t.length} reassuring terms, like ${t.slice(0, 3).join(", ")}`);
      return t.length ? warn(`Only ${t.join(", ")}`) : fail("No reassuring terms like warranty or secure");
    },
  },
  {
    id: "trust-badges",
    category: "trust",
    label: "Badges or certifications",
    weight: 1,
    box: "trust",
    fix: "Show real certifications or awards you hold, small and near the details.",
    run: ({ d, x }) => {
      const b = d.trust_indicators.trust_badges;
      if (b === 0) return warn("No badges or certifications");
      return pass(x.badge_labels.length ? x.badge_labels.join(", ") : `${b} ${plural(b, "badge")}`);
    },
  },
  {
    id: "trust-contact",
    category: "trust",
    label: "Contact path visible",
    weight: 2,
    fix: "Add a contact or chat link to the header or footer.",
    run: ({ x }) => (x.contact_kinds.length ? pass(cap(x.contact_kinds.join(", "))) : warn("No contact link, email or phone")),
  },
  {
    id: "trust-policies",
    category: "trust",
    label: "Privacy and terms linked",
    weight: 1,
    fix: "Link privacy and terms pages from the footer.",
    run: ({ x }) => {
      if (x.privacy_link && x.terms_link) return pass("Privacy and terms linked");
      if (x.privacy_link || x.terms_link) return warn(x.privacy_link ? "Privacy linked, terms missing" : "Terms linked, privacy missing");
      return fail("Neither privacy nor terms linked");
    },
  },
  {
    id: "trust-https",
    category: "trust",
    label: "Served over HTTPS",
    weight: 2,
    fix: "Serve every page over HTTPS.",
    run: ({ x }) => (x.url_https === null ? warn("Couldn't read the address") : x.url_https ? pass("HTTPS") : fail("Plain HTTP")),
  },
  {
    id: "trust-about",
    category: "trust",
    label: "Company story linked",
    weight: 1,
    fix: "Link a short about page so people know who they're buying from.",
    run: ({ x }) => (x.about_link ? pass("About page linked") : warn("No about or story link")),
  },

  /* ── Social proof ────────────────────────────────── */
  {
    id: "proof-reviews",
    category: "social-proof",
    label: "Reviews or ratings present",
    weight: 3,
    box: "reviews",
    fix: "Collect and show reviews on the product page, with the star rating up top.",
    run: ({ d, x }) => {
      if (!d.has_reviews_or_ratings) return fail("No reviews or ratings");
      return pass(x.review_count > 0 ? `${n(x.review_count)} ${plural(x.review_count, "review")} found` : "Ratings or reviews mentioned");
    },
  },
  {
    id: "proof-review-count",
    category: "social-proof",
    label: "Enough reviews to trust",
    weight: 2,
    box: "reviews",
    fix: "Ask recent buyers for reviews until the count reads as real, then show the number.",
    run: ({ x }) => {
      const c = x.review_count;
      const src = x.review_count_source === "none" ? "" : `, from ${x.review_count_source}`;
      if (c >= 4) return pass(`${n(c)} reviews${src}`);
      return c > 0 ? warn(`${c} ${plural(c, "review")}${src}`) : fail("No reviews counted");
    },
  },
  {
    id: "proof-rating",
    category: "social-proof",
    label: "Rating 4.0 or higher",
    weight: 2,
    box: "reviews",
    fix: "Show the average rating as stars and a number, and mark it up as AggregateRating.",
    run: ({ d, x }) => {
      const r = d.average_rating ?? x.text_rating;
      if (r !== null) return r >= 4 ? pass(`Rated ${r.toFixed(1)} out of 5`) : warn(`Rated ${r.toFixed(1)} out of 5`);
      return d.has_reviews_or_ratings ? warn("Rating isn't stated as a number") : fail("No rating");
    },
  },
  {
    id: "proof-rating-near-title",
    category: "social-proof",
    label: "Rating next to the name",
    weight: 1,
    box: "reviews",
    fix: "Put the star rating and review count right under the product name.",
    run: ({ x }) => (x.rating_near_title ? pass("Stars sit by the product name") : warn("No rating near the product name")),
  },
  {
    id: "proof-numbers",
    category: "social-proof",
    label: "Customer numbers",
    weight: 1,
    fix: "Add a real customer count, like “40,000 people carry one”.",
    run: ({ d, x }) =>
      d.trust_indicators.numbers > 0 ? pass(x.numbers_phrase ? q(x.numbers_phrase, 32) : "Customer counts shown") : warn("No customer counts"),
  },
  {
    id: "proof-quotes",
    category: "social-proof",
    label: "Customer quotes",
    weight: 1,
    fix: "Quote two or three customers in their own words, with a name.",
    run: ({ x }) => (x.quote_count > 0 ? pass(`${x.quote_count} quoted ${plural(x.quote_count, "testimonial")}`) : warn("No customer quotes")),
  },
  {
    id: "proof-client-logos",
    category: "social-proof",
    label: "Customer logos",
    weight: 1,
    fix: "Show logos of known customers or stockists in a single quiet row.",
    run: ({ x }) => {
      const k = x.client_logo_count;
      if (k >= 3) return pass(`${k} logos`);
      return warn(k > 0 ? `${k} ${plural(k, "logo")}` : "No customer logos");
    },
  },
  {
    id: "proof-press",
    category: "social-proof",
    label: "Press or awards",
    weight: 1,
    fix: "Mention real press coverage or awards, with the outlet's name.",
    run: ({ x }) => (x.press_phrases.length ? pass(cap(x.press_phrases.join(", "))) : warn("No press mentions or awards")),
  },
  {
    id: "proof-case-studies",
    category: "social-proof",
    label: "Case studies",
    weight: 2,
    fix: "Link one or two customer stories with concrete results.",
    run: ({ x }) => (x.case_studies ? pass("Case studies linked") : warn("No case studies or customer stories")),
  },

  /* ── Content ─────────────────────────────────────── */
  {
    id: "content-title",
    category: "content",
    label: "Descriptive page title",
    weight: 2,
    fix: "Name the product and its main benefit in the page title.",
    run: ({ d }) => {
      if (!d.title) return fail("No title tag");
      return d.title.length > 10 ? pass(q(d.title, 48)) : warn(`Only ${d.title.length} characters: ${q(d.title)}`);
    },
  },
  {
    id: "content-h1",
    category: "content",
    label: "Clear product heading",
    weight: 3,
    box: "h1",
    fix: "Use the product name as the page's H1.",
    run: ({ d }) => {
      if (!d.h1) return fail("No main heading");
      if (d.h1.length <= 5) return warn(`Short heading ${q(d.h1)}`);
      if (d.title && !sharesWords(d.h1, d.title)) return warn(`${q(d.h1, 32)} shares no words with the title`);
      return pass(q(d.h1, 44));
    },
  },
  {
    id: "content-single-h1",
    category: "content",
    label: "One H1 on the page",
    weight: 1,
    box: "h1",
    fix: "Keep exactly one H1, the product name. Make the others H2s.",
    run: ({ d }) => (d.h1_count === 1 ? pass("Exactly one H1") : d.h1_count === 0 ? fail("No H1") : warn(`${d.h1_count} H1s compete`)),
  },
  {
    id: "content-subheadings",
    category: "content",
    label: "Subheadings break up the page",
    weight: 2,
    fix: "Split the details under short H2s: materials, sizing, care.",
    run: ({ d }) => {
      const k = (d.headings.h2_count ?? 0) + (d.headings.h3_count ?? 0);
      return d.has_subheadings ? pass(`${k} H2 and H3 headings`) : fail("No subheadings");
    },
  },
  {
    id: "content-description",
    category: "content",
    label: "Description with substance",
    weight: 2,
    fix: "Write what it is, who it's for and why it's better, in about 150 words.",
    run: ({ x }) => {
      const w = x.description_words;
      if (w >= 120) return pass(`${n(w)} words of description`);
      return w >= 40 ? warn(`${w} words, thin for a product page`) : fail(`${w} ${plural(w, "word")} of description`);
    },
  },
  {
    id: "content-specs",
    category: "content",
    label: "Specs or details",
    weight: 1,
    fix: "Add a short specs list: size, weight, materials, care.",
    run: ({ x }) => (x.specs_present ? pass("Specs or details section") : warn("No specs, materials or dimensions")),
  },
  {
    id: "content-faq",
    category: "content",
    label: "FAQ answers objections",
    weight: 1,
    fix: "Answer the three questions support hears most, right on the page.",
    run: ({ x }) => {
      if (x.faq_questions >= 2) return pass(`${x.faq_questions} questions answered`);
      return x.faq_heading ? pass("FAQ section") : warn("No FAQ");
    },
  },
  {
    id: "content-variants",
    category: "content",
    label: "Size and color options",
    weight: 2,
    fix: "Show variants as visible swatches and size buttons, not a hidden menu.",
    run: ({ x }) => (x.variants.length ? pass(`${cap(x.variants.join(" and "))} options`) : warn("No size or color options found")),
  },
  {
    id: "content-breadcrumbs",
    category: "content",
    label: "Breadcrumbs",
    weight: 1,
    fix: "Add a breadcrumb trail so people can step back to the category.",
    run: ({ d }) => (d.breadcrumbs_present ? pass("Breadcrumb trail") : warn("No breadcrumbs")),
  },
  {
    id: "content-search",
    category: "content",
    label: "Site search",
    weight: 1,
    fix: "Put a search box in the header.",
    run: ({ d }) => (d.has_search ? pass("Search box") : warn("No site search")),
  },
  {
    id: "content-related",
    category: "content",
    label: "Related products",
    weight: 1,
    fix: "Suggest a few related products below the details.",
    run: ({ d }) => (d.related_products_present ? pass("Related products section") : warn("No related products")),
  },
  {
    id: "content-sections",
    category: "content",
    label: "Page split into sections",
    weight: 1,
    fix: "Group the page into sections: details, reviews, FAQ.",
    run: ({ d }) =>
      d.section_count >= 3
        ? pass(`${d.section_count} sections`)
        : warn(d.section_count ? `${d.section_count} ${plural(d.section_count, "section")}` : "No <section> elements"),
  },

  /* ── Media ───────────────────────────────────────── */
  {
    id: "media-images",
    category: "media",
    label: "Images on the page",
    weight: 3,
    fix: "Add product photos. Pages without images rarely sell.",
    run: ({ x }) => (x.media_count > 0 ? pass(`${n(x.media_count)} ${plural(x.media_count, "image")}`) : fail("No images")),
  },
  {
    id: "media-image-count",
    category: "media",
    label: "Three or more photos",
    weight: 2,
    fix: "Show at least three photos: front, detail, and in use.",
    run: ({ x }) => {
      const k = x.img_total;
      if (k >= 3) return pass(`${k} photos`);
      return k > 0 ? warn(`${k} ${plural(k, "photo")}`) : fail("No photos");
    },
  },
  {
    id: "media-gallery",
    category: "media",
    label: "Image gallery",
    weight: 2,
    fix: "Group product shots in a gallery people can click through.",
    run: ({ d }) => (d.gallery_present ? pass("Images grouped in a gallery") : warn("No gallery of product shots")),
  },
  {
    id: "media-video",
    category: "media",
    label: "Product video",
    weight: 1,
    fix: "Add a short video of the product in use.",
    run: ({ x }) => (x.video_present ? pass("Video on the page") : warn("No product video")),
  },
  {
    id: "media-hero",
    category: "media",
    label: "Large image up top",
    weight: 2,
    box: "hero",
    fix: "Lead with one large product photo in the first screen.",
    run: ({ r }) => {
      if (!r) return null;
      const hero = r.boxes.find((b) => b.kind === "hero");
      if (!hero) return fail("No large image in the first screen");
      const share = (Math.min(hero.y + hero.h, r.viewportHeight) - Math.max(hero.y, 0)) * hero.w / (r.viewportWidth * r.viewportHeight);
      return share >= 0.12 ? pass(`Main image fills ${pct(share)} of the first screen`) : warn(`Main image covers ${pct(share)} of the first screen`);
    },
  },

  /* ── Accessibility ───────────────────────────────── */
  {
    id: "a11y-alt",
    category: "accessibility",
    label: "Images have alt text",
    weight: 3,
    fix: "Describe every product image in its alt text.",
    run: ({ x }) => {
      const a = x.alt_described;
      const t = x.alt_total;
      if (t === 0) return pass("No images that need descriptions");
      const c = a / t;
      const e = `${a} of ${t} images described`;
      return c >= 0.8 ? pass(e) : c >= 0.5 ? warn(e) : fail(e);
    },
  },
  {
    id: "a11y-buttons",
    category: "accessibility",
    label: "Buttons have names",
    weight: 2,
    fix: "Give icon buttons an aria-label, like “Add to wishlist”.",
    run: ({ d }) => {
      const u = d.a11y_unlabeled_buttons;
      if (u === 0) return pass("Every button has a name");
      const e = `${u} ${plural(u, "button")} without a name`;
      return u <= 2 ? warn(e) : fail(e);
    },
  },
  {
    id: "a11y-links",
    category: "accessibility",
    label: "Links have names",
    weight: 2,
    fix: "Give icon links a text label or aria-label.",
    run: ({ d }) => {
      const u = d.a11y_unlabeled_links;
      if (u === 0) return pass("Every link has a name");
      const e = `${u} ${plural(u, "link")} without a name`;
      return u <= 5 ? warn(e) : fail(e);
    },
  },
  {
    id: "a11y-lang",
    category: "accessibility",
    label: "Page language set",
    weight: 1,
    fix: "Add lang=\"en\" (or the right language) to the <html> tag.",
    run: ({ x }) => (x.lang ? pass(`lang="${clip(x.lang, 12)}"`) : fail("No lang attribute")),
  },
  {
    id: "a11y-form-labels",
    category: "accessibility",
    label: "Form fields labeled",
    weight: 2,
    box: "form",
    fix: "Give every field a visible <label>. Placeholders disappear as you type.",
    run: ({ x }) => {
      const t = x.form_inputs;
      const l = x.form_inputs_labeled;
      if (t === 0) return pass("No form fields");
      const e = `${l} of ${t} fields labeled`;
      return l / t >= 0.9 ? pass(e) : l / t >= 0.5 ? warn(e) : fail(e);
    },
  },
  {
    id: "a11y-main",
    category: "accessibility",
    label: "Main landmark",
    weight: 1,
    fix: "Wrap the page content in a <main> element.",
    run: ({ d }) => (d.main_present ? pass("Has a <main> landmark") : warn("No <main> landmark")),
  },
  {
    id: "a11y-heading-order",
    category: "accessibility",
    label: "Heading levels in order",
    weight: 1,
    fix: "Step headings down one level at a time, H1 then H2 then H3.",
    run: ({ x }) => (x.heading_skip ? warn(`Jumps from ${x.heading_skip}`) : pass("No skipped levels")),
  },
  {
    id: "a11y-skip-link",
    category: "accessibility",
    label: "Skip link",
    weight: 1,
    fix: "Add a “Skip to content” link as the first focusable element.",
    run: ({ x }) => (x.skip_link ? pass("Skip link present") : warn("No skip to content link")),
  },

  /* ── Technical ───────────────────────────────────── */
  {
    id: "tech-meta-title",
    category: "technical",
    label: "Title length 30 to 60",
    weight: 1,
    fix: "Write a 30 to 60 character title: product name, type, brand.",
    run: ({ d }) => {
      const l = d.meta_title_len;
      if (l >= 30 && l <= 60) return pass(`${l} characters`);
      if (l === 0) return fail("No title");
      return l > 80 ? fail(`${l} characters, gets cut off`) : warn(`${l} characters`);
    },
  },
  {
    id: "tech-meta-description",
    category: "technical",
    label: "Meta description 120 to 160",
    weight: 1,
    fix: "Write a 120 to 160 character meta description that sells the click.",
    run: ({ d }) => {
      const l = d.meta_description_len;
      if (l >= 120 && l <= 160) return pass(`${l} characters`);
      return l === 0 ? fail("Missing") : warn(`${l} characters`);
    },
  },
  {
    id: "tech-og",
    category: "technical",
    label: "Social preview tags",
    weight: 1,
    fix: "Add og:title, og:description and og:image for link previews.",
    run: ({ d }) => (d.og_tags_present ? pass("Open Graph tags set") : warn("No Open Graph tags")),
  },
  {
    id: "tech-canonical",
    category: "technical",
    label: "Canonical URL",
    weight: 1,
    fix: "Add a canonical link so variants of this URL don't split ranking.",
    run: ({ d }) => (d.canonical_present ? pass("Canonical link set") : warn("No canonical link")),
  },
  {
    id: "tech-schema-product",
    category: "technical",
    label: "Product structured data",
    weight: 2,
    fix: "Add Product schema in JSON-LD so search can show price and stars.",
    run: ({ x }) => {
      const hit = x.jsonld.types.find((t) => /^(Product|ProductGroup|SoftwareApplication|Service|Offer)$/.test(t));
      return hit ? pass(`${hit} schema`) : warn("No product structured data");
    },
  },
  {
    id: "tech-schema-offer",
    category: "technical",
    label: "Price in structured data",
    weight: 1,
    fix: "Include offers.price and priceCurrency in the Product schema.",
    run: ({ x }) => (x.jsonld.has_offer_price ? pass("Offer with a price") : warn("No price in structured data")),
  },
  {
    id: "tech-schema-rating",
    category: "technical",
    label: "Rating in structured data",
    weight: 1,
    fix: "Add AggregateRating to the Product schema.",
    run: ({ x }) => (x.jsonld.has_aggregate_rating ? pass("AggregateRating set") : warn("No rating in structured data")),
  },
  {
    id: "tech-html-size",
    category: "technical",
    label: "Page weight",
    weight: 1,
    fix: "Trim inline scripts and unused markup to get the HTML under 200 KB.",
    run: ({ d }) => {
      const b = d.html_bytes;
      const e = `${kb(b)} of HTML`;
      return b < 200_000 ? pass(e) : b < 2_000_000 ? warn(e) : fail(e);
    },
  },
  {
    id: "tech-scripts",
    category: "technical",
    label: "Third-party scripts",
    weight: 1,
    fix: "Audit tags and pixels. Remove the ones nobody reads.",
    run: ({ d }) => {
      const e = d.external_script_count;
      const ev = `${e} external ${plural(e, "script")}`;
      return e < 15 ? pass(ev) : e < 30 ? warn(ev) : fail(ev);
    },
  },
  {
    id: "tech-dom-depth",
    category: "technical",
    label: "Shallow DOM",
    weight: 1,
    fix: "Flatten wrapper divs. Deep trees slow layout on phones.",
    run: ({ d }) => {
      const k = d.max_dom_depth;
      const e = `${k} levels deep`;
      return k <= 32 ? pass(e) : k <= 48 ? warn(e) : fail(e);
    },
  },
  {
    id: "tech-image-dimensions",
    category: "technical",
    label: "Images reserve their space",
    weight: 1,
    fix: "Set width and height on images so the page doesn't jump as they load.",
    run: ({ x }) => {
      const t = x.img_total;
      if (t === 0) return pass("No images to size");
      const e = `${x.img_with_dims} of ${t} images set width and height`;
      const r = x.img_with_dims / t;
      return r >= 0.8 ? pass(e) : r >= 0.4 ? warn(e) : fail(e);
    },
  },
  {
    id: "tech-lazy-images",
    category: "technical",
    label: "Offscreen images load lazily",
    weight: 1,
    fix: "Add loading=\"lazy\" to images below the first screen.",
    run: ({ x }) => {
      const t = x.img_total;
      if (t <= 3) return pass(`${t} ${plural(t, "image")}, nothing to defer`);
      return x.img_lazy > 0 ? pass(`${x.img_lazy} images load lazily`) : warn(`None of ${t} images load lazily`);
    },
  },

  /* ── Mobile ──────────────────────────────────────── */
  {
    id: "mobile-viewport",
    category: "mobile",
    label: "Mobile viewport tag",
    weight: 3,
    fix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.",
    run: ({ d }) => (d.viewport_present ? pass("Viewport tag set") : fail("No viewport tag")),
  },
  {
    id: "mobile-zoom",
    category: "mobile",
    label: "Pinch zoom allowed",
    weight: 2,
    fix: "Remove user-scalable=no and maximum-scale from the viewport tag.",
    run: ({ d, x }) => {
      if (!d.viewport_present) return fail("No viewport tag");
      return x.zoom_blocked ? fail("Viewport blocks pinch zoom") : pass("Pinch zoom allowed");
    },
  },
  {
    id: "mobile-no-popups",
    category: "mobile",
    label: "Nothing covers the page on load",
    weight: 2,
    fix: "Delay the popup until people scroll or show intent to leave.",
    run: ({ d, r }) => {
      if (r) {
        if (r.overlayCoverage >= 0.25) {
          const what = r.overlayText ? ` (${q(r.overlayText, 28)})` : "";
          return fail(`An overlay covers ${pct(r.overlayCoverage)} of the first screen${what}`);
        }
        return pass("Nothing covers the page on load");
      }
      return d.popup_count > 0
        ? warn(`${d.popup_count} popup or overlay ${plural(d.popup_count, "element")} in the markup`)
        : pass("No popups in the markup");
    },
  },
  {
    id: "mobile-responsive-images",
    category: "mobile",
    label: "Responsive images",
    weight: 1,
    fix: "Serve phone-sized images with srcset or <picture>.",
    run: ({ x }) => {
      if (x.img_total === 0) return pass("No images to size");
      return x.responsive_images > 0
        ? pass(`${x.responsive_images} responsive image ${plural(x.responsive_images, "source")}`)
        : warn("No srcset or <picture> sizes");
    },
  },
  {
    id: "mobile-input-types",
    category: "mobile",
    label: "Right keyboard for email and phone",
    weight: 1,
    fix: "Use type=\"email\" and type=\"tel\" so phones show the right keyboard.",
    run: ({ x }) => {
      const t = x.contact_inputs;
      const k = x.contact_inputs_typed;
      if (t === 0) return pass("No email or phone fields");
      if (k === t) return pass(`${k} of ${t} ${plural(t, "field")} use${t === 1 ? "s" : ""} email or tel`);
      const off = t - k;
      return warn(`${off} of ${t} contact ${plural(t, "field")} ${off === 1 ? "uses" : "use"} a text keyboard`);
    },
  },
];

export const SIGNAL_IDS = DEFS.map((d) => d.id);
export const SIGNAL_LABELS: Record<string, string> = Object.fromEntries(DEFS.map((d) => [d.id, d.label]));

export function buildSignals(ctx: SignalContext): Signal[] {
  const out: Signal[] = [];
  for (const def of DEFS) {
    const res = def.run(ctx);
    if (!res) continue;
    out.push({
      id: def.id,
      category: def.category,
      label: def.label,
      status: res.status,
      weight: def.weight,
      evidence: res.evidence,
      fix: res.fix ?? def.fix,
      ...(def.box ? { box: def.box } : {}),
    });
  }
  return out;
}
