import { describe, expect, it } from "vitest";
import { classMatches, load, maxDepth, pageText, stringsMatching, textOf } from "../heuristics/dom";
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
} from "../heuristics/port";
import { calculateConversionScores } from "../heuristics/conversion";

const page = (body: string, head = "") => `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;
const ecommerce = getDynamicKeywords("ecommerce");

describe("dom helpers", () => {
  it("keeps words apart across elements and skips code", () => {
    const $ = load(
      page(`<button> Add <span>to cart</span></button><noscript>ns</noscript><template><p>tpl</p></template>`, `<title>T</title><script>var x = "add to cart"</script><style>.a{}</style>`),
    );
    expect(textOf($("button")[0])).toBe("Add to cart");
    expect(pageText($)).toBe("T Add to cart");
  });

  it("matches classes like bs4's class_=regex", () => {
    const $ = load(page(`<div class="product-reviews big"></div><div class="x"></div>`));
    expect(classMatches($("div")[0], /review/i)).toBe(true);
    expect(classMatches($("div")[1], /review/i)).toBe(false);
  });

  it("counts matching text nodes one per node, never inside scripts", () => {
    const $ = load(page(`<p>warranty one</p><p>warranty two</p><script>"warranty"</script>`));
    expect(stringsMatching($, /warranty/i)).toHaveLength(2);
  });

  it("measures depth with <html> at 1, like get_depth(soup)", () => {
    const $ = load("<html><body><div><p>x</p></div></body></html>");
    expect(maxDepth($.root()[0])).toBe(4);
  });
});

describe("detect_site_type", () => {
  it("picks the type with the most keyword hits", () => {
    expect(detectSiteType("add to cart, checkout, free shipping").type).toBe("ecommerce");
    expect(detectSiteType("start a free trial, see pricing per month").type).toBe("saas");
    expect(detectSiteType("enterprise solutions, contact sales for a case study").type).toBe("b2b");
    expect(detectSiteType("book now for a consultation or call now").type).toBe("service");
  });

  it("breaks ties by order, like Python's max(dict)", () => {
    // one ecommerce hit (checkout) and one saas hit (sign up)
    expect(detectSiteType("sign up then checkout").type).toBe("ecommerce");
  });

  it("falls back to generic with no hits", () => {
    const r = detectSiteType("hello world");
    expect(r.type).toBe("generic");
    expect(r.scores).toEqual({ ecommerce: 0, saas: 0, b2b: 0, service: 0 });
  });
});

describe("detect_page_type", () => {
  it("needs four product hits to call it a product page", () => {
    expect(detectPageType("add to cart · quantity · size · color · reviews").type).toBe("product");
  });
  it("prefers homepage at three hits when it beats product", () => {
    expect(detectPageType("welcome · about us · our story · careers").type).toBe("homepage");
  });
  it("prefers category at three hits when it beats product", () => {
    expect(detectPageType("filter · sort · showing 24 results").type).toBe("category");
  });
  it("falls back to the argmax below the thresholds", () => {
    expect(detectPageType("price and shipping and a blog").type).toBe("product");
  });
  it("is unknown with no hits", () => {
    expect(detectPageType("lorem ipsum").type).toBe("unknown");
  });
});

describe("extract_basic_info", () => {
  it("prefers an H1 with a product keyword, skips UI words", () => {
    const $ = load(page(`<h1>Your cart</h1><h1>Trail Bottle 750 ml</h1>`, "<title>Trail Bottle | Kestrel</title>"));
    expect(extractBasicInfo($, ecommerce)).toEqual({ title: "Trail Bottle | Kestrel", h1: "Trail Bottle 750 ml" });
  });
  it("falls back to a descriptive H2 when there is no H1", () => {
    const $ = load(page(`<h2>Menu</h2><h2>The everyday steel bottle</h2>`));
    expect(extractBasicInfo($, ecommerce).h1).toBe("The everyday steel bottle");
  });
  it("ignores <title> inside inline SVG", () => {
    const $ = load(`<html><body><svg><title>icon</title></svg></body></html>`);
    expect(extractBasicInfo($, ecommerce).title).toBe("");
  });
});

describe("extract_pricing_info", () => {
  it("reads a .price element first", () => {
    const $ = load(page(`<span class="price">$38.00</span><p>was $50</p>`));
    expect(extractPricingInfo($, pageText($))).toEqual({ price: "$38.00", is_free_product: false });
  });
  it("finds per-unit prices in text and spaces the unit like the original", () => {
    const $ = load(page(`<p>Plans from $12/mo for small teams</p>`));
    expect(extractPricingInfo($, pageText($)).price).toBe("$12 /mo");
  });
  it("flags free products", () => {
    const $ = load(page(`<p>Start free today, no card needed</p>`));
    const r = extractPricingInfo($, pageText($));
    expect(r.is_free_product).toBe(true);
    expect(r.price.toLowerCase()).toBe("start free");
  });
  it("trims a long price container to its first amount", () => {
    const $ = load(page(`<div class="price-filter">Price range from $0 to $500, filter and apply to see results</div>`));
    expect(extractPricingInfo($, pageText($)).price).toBe("$0");
  });
  it("returns nothing without a price", () => {
    const $ = load(page(`<p>Our bottle is great.</p>`));
    expect(extractPricingInfo($, pageText($))).toEqual({ price: "", is_free_product: false });
  });
});

describe("extract_cta_info", () => {
  it("finds the CTA with its price, position and delivery line", () => {
    const $ = load(
      page(`<nav><a href="/">Home</a><a href="/shop">Shop</a></nav>
        <div class="buy"><p class="price">$20</p><div class="act"><button>Add to cart</button><p>Free shipping and 30-day returns</p></div></div>`),
    );
    const r = extractCtaInfo($, ecommerce);
    expect(r.cta).toBe("Add to cart");
    expect(r.price_near_cta).toBe(true);
    expect(r.cta_above_fold).toBe(true);
    expect(r.shipping_returns_near_cta).toBe(true);
    expect(r.cta_index).toBe(2);
    expect(r.clickable_count).toBe(3);
  });

  it("skips buttons whose label matches an exclude pattern", () => {
    const $ = load(page(`<button aria-label="Close menu">Add to cart</button>`));
    expect(extractCtaInfo($, ecommerce).cta).toBeNull();
  });

  it("accepts an interactive div, and marks it", () => {
    const $ = load(page(`<div onclick="go()">Buy now</div>`));
    const r = extractCtaInfo($, ecommerce);
    expect(r.cta).toBe("Buy now");
    expect(r.cta_from_span).toBe(true);
  });

  it("won't take a long wrapper as the CTA (deviation 4)", () => {
    const $ = load(page(`<div role="main">Add to cart is what we would love you to do here today</div>`));
    expect(extractCtaInfo($, ecommerce).cta).toBeNull();
  });

  it("marks a CTA after many clickables as below the fold", () => {
    const links = Array.from({ length: 12 }, (_, i) => `<a href="/${i}">Link ${i}</a>`).join("");
    const $ = load(page(`${links}<button>Add to cart</button>`));
    expect(extractCtaInfo($, ecommerce).cta_above_fold).toBe(false);
  });

  it("finds a price up to six levels away", () => {
    const $ = load(
      page(`<div><div><span>$49.00</span></div><div><div><div><div><div><button>Add to cart</button></div></div></div></div></div></div>`),
    );
    expect(extractCtaInfo($, ecommerce).price_near_cta).toBe(true);
  });
});

describe("extract_image_info", () => {
  it("counts every image kind and alt coverage over img + svg", () => {
    const $ = load(
      page(`<img src="a.jpg" alt="A"><img src="b.jpg"><svg class="icon"></svg><svg aria-label="chart"></svg>
        <div style="background-image:url(x.jpg)"></div><picture></picture><video></video>`),
    );
    expect(extractImageInfo($)).toEqual({ image_count: 6, images_missing_alt: 1, alt_coverage: 0.67 });
  });
});

describe("extract_testimonial_info", () => {
  it("counts review items inside review containers", () => {
    const $ = load(page(`<section class="reviews"><div class="review">Good</div><div class="review">Great</div></section>`));
    expect(extractTestimonialInfo($, readJsonLd($)).testimonials).toBe(2);
  });
  it("falls back to quoted text", () => {
    const $ = load(page(`<p>"This bottle kept my water cold all day long"</p>`));
    expect(extractTestimonialInfo($, readJsonLd($)).testimonials).toBe(1);
  });
  it("reads 'based on N reviews'", () => {
    const $ = load(page(`<p>4.5 out of 5, based on 37 reviews</p>`));
    const r = extractTestimonialInfo($, readJsonLd($));
    expect(r.testimonials).toBe(37);
    expect(r.has_reviews_or_ratings).toBe(true);
  });
  it("reads JSON-LD ratings, including @graph, and survives a broken script", () => {
    const ld = JSON.stringify({ "@graph": [{ "@type": "Product", aggregateRating: { ratingValue: "4.6", reviewCount: "212" } }] });
    const $ = load(page(`<p>hi</p>`, `<script type="application/ld+json">{oops</script><script type="application/ld+json">${ld}</script>`));
    const r = extractTestimonialInfo($, readJsonLd($));
    expect(r.average_rating).toBe(4.6);
    expect(r.testimonials).toBe(212);
  });
});

describe("extract_trust_info", () => {
  it("runs the selectors the original passed to find_all (deviation 1)", () => {
    const $ = load(
      page(`<div class="security-badges"><img alt="secure checkout" src="s.png"></div>
        <p>Pay with PayPal or Apple Pay</p><button>Buy with Shop Pay</button><p>Lifetime warranty</p>`),
    );
    const r = extractTrustInfo($, pageText($).toLowerCase());
    expect(r.security_badges).toBeGreaterThan(0);
    expect(r.trust_indicators.payment_integrations).toBe(2);
    expect(r.trust_indicators.payment_buttons).toBe(1);
    expect(r.trust_indicators.effective_trust_badges).toBe(3);
    expect(r.guarantees).toBe(1);
  });
});

describe("extract_technical_info", () => {
  it("measures meta tags, landmarks and unlabeled controls", () => {
    const html = page(
      `<nav aria-label="Breadcrumb"><a href="/">Home</a></nav>
       <form role="search"><input type="search" aria-label="Search"></form>
       <button><svg></svg></button><button><img src="x.png" alt="Close"></button>
       <a href="/x"></a><a href="/y" aria-label="Cart"></a>
       <div class="modal" hidden>Sign up</div><div class="popup">Hi</div>`,
      `<title>Trail Bottle 750 ml, insulated steel</title><meta name="description" content="${"x".repeat(130)}">
       <meta property="og:title" content="t"><link rel="canonical" href="https://a.example/p"><meta name="viewport" content="width=device-width">`,
    );
    const r = extractTechnicalInfo(load(html), html);
    expect(r.meta_title_len).toBe(36);
    expect(r.meta_description_len).toBe(130);
    expect(r.og_tags_present).toBe(true);
    expect(r.canonical_present).toBe(true);
    expect(r.viewport_present).toBe(true);
    expect(r.breadcrumbs_present).toBe(true);
    expect(r.has_search).toBe(true);
    expect(r.a11y_unlabeled_buttons).toBe(1);
    expect(r.a11y_unlabeled_links).toBe(1);
    expect(r.popup_count).toBe(1);
  });
});

describe("summarize_structure", () => {
  it("orders headings by level, spots galleries and groups the CTA", () => {
    const $ = load(
      page(`<h2>Details</h2><h1>Bottle</h1><div class="g"><img src="a"><img src="b"></div>
        <div class="buy"><span>$12</span><button>Add to cart</button></div>`),
    );
    const r = summarizeStructure($, "Bottle");
    expect(r.heading_hierarchy).toEqual(["h1: Bottle", "h2: Details"]);
    expect(r.gallery_present).toBe(true);
    expect(r.cta_grouping).toBe(true);
    expect(r.h1_count).toBe(1);
  });
  it("groups picture > img by the gallery container (deviation 9)", () => {
    const $ = load(page(`<div><picture><img src="a"></picture><picture><img src="b"></picture></div>`));
    expect(summarizeStructure($).gallery_present).toBe(true);
  });
  it("finds CTAs in visible modals only (deviation 6)", () => {
    expect(summarizeStructure(load(page(`<div class="modal">Sign up now</div>`))).modals_with_cta).toBe(true);
    expect(summarizeStructure(load(page(`<div class="modal" aria-hidden="true">Sign up now</div>`))).modals_with_cta).toBe(false);
  });
});

describe("calculate_conversion_scores", () => {
  const base = {
    site_type: "ecommerce" as const,
    page_type: "product" as const,
    title: "A product title here",
    h1: "Trail Bottle",
    price: "$38",
    is_free_product: false,
    has_subheadings: true,
    cta: "Add to cart",
    cta_above_fold: true,
    price_near_cta: false,
    shipping_returns_near_cta: true,
    testimonials: 2,
    has_reviews_or_ratings: true,
    average_rating: 4.5,
    trust_indicators: {
      security_badges: 0,
      compliance_mentions: 0,
      effective_trust_badges: 1,
      guarantees: 1,
      client_logos: 0,
      trust_badges: 0,
      compliance: 0,
      awards: 0,
      numbers: 0,
      payment_integrations: 0,
      payment_buttons: 0,
    },
    image_count: 2,
    alt_coverage: 0.6,
    gallery_present: false,
    viewport_present: true,
    a11y_unlabeled_buttons: 1,
    a11y_unlabeled_links: 3,
    html_bytes: 500_000,
    external_script_count: 20,
    meta_title_len: 45,
    meta_description_len: 130,
    form_count: 4,
    popup_count: 0,
    modals_with_cta: false,
    breadcrumbs_present: false,
    has_search: true,
    cta_grouping: true,
    main_present: true,
    related_products_present: true,
    h1_count: 1,
    section_count: 2,
  };

  it("matches a hand-computed product page", () => {
    expect(calculateConversionScores(base)).toEqual({
      value_proposition_clarity: 10,
      cta_effectiveness: 8,
      trust_social_proof: 8,
      visual_imagery: 6,
      mobile_accessibility: 7,
      technical_performance: 8,
      user_experience: 7,
      conversion_optimization: 9,
      // .25*10 + .2*8 + .15*8 + .15*6 + .1*7 + .05*8 + .05*7 + .05*9
      overall_score: 8.1,
    });
  });

  it("gives SaaS a clarity point without a price and a CTA point without shipping", () => {
    const r = calculateConversionScores({ ...base, site_type: "saas", price: "", has_subheadings: false, shipping_returns_near_cta: false });
    expect(r.value_proposition_clarity).toBe(7);
    expect(r.cta_effectiveness).toBe(8);
  });

  it("stacks every user experience penalty", () => {
    const r = calculateConversionScores({ ...base, form_count: 9, popup_count: 2, modals_with_cta: true, has_search: false });
    expect(r.user_experience).toBe(1);
  });

  it("uses homepage weights for homepages", () => {
    const r = calculateConversionScores({ ...base, page_type: "homepage", section_count: 3 });
    // .3*10 + .1*8 + .15*8 + .15*6 + .1*7 + .05*8 + .1*7 + .05*10
    expect(r.overall_score).toBe(8.2);
  });
});

describe("classify", () => {
  it("trusts a single Product schema over homepage keyword counts", async () => {
    const { classify } = await import("../heuristics");
    const kw = classify({ ecommerce: 7, saas: 4, b2b: 1, service: 3 }, { product: 14, homepage: 16, category: 7 }, "homepage", null);
    expect(kw.pageType).toBe("homepage");
    const ld = classify({ ecommerce: 7, saas: 4, b2b: 1, service: 3 }, { product: 14, homepage: 16, category: 7 }, "homepage", null, true);
    expect(ld).toMatchObject({ pageType: "product", pageReason: "Product structured data" });
    expect(ld.pageConfidence).toBeGreaterThanOrEqual(0.8);
  });

  it("keeps 'service' in the confidence so a services page reads as unsure", async () => {
    const { classify } = await import("../heuristics");
    const r = classify({ ecommerce: 2, saas: 0, b2b: 0, service: 6 }, { product: 1, homepage: 0, category: 0 }, "product", null);
    expect(r.siteType).toBe("ecommerce");
    expect(r.confidence).toBeLessThan(0.2);
  });

  it("scores the pinned type but still reports what it detected", async () => {
    const { classify } = await import("../heuristics");
    const r = classify({ ecommerce: 9, saas: 1, b2b: 0, service: 0 }, { product: 6, homepage: 1, category: 0 }, "product", "b2b");
    expect(r).toMatchObject({ siteType: "b2b", detected: "ecommerce", pinned: true });
  });
});
