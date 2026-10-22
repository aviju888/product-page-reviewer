import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runHeuristics, type RenderedFacts } from "../heuristics";
import { scoreSignals } from "../score";
import { SAMPLES } from "../samples";
import { CATEGORY_IDS, type Box } from "../types";

const sample = (id: "strong" | "weak") => readFileSync(path.join(process.cwd(), "public", "reviewer", "samples", SAMPLES[id].file), "utf8");

const rendered = (boxes: Box[], overlayCoverage = 0): RenderedFacts => ({
  viewportWidth: 1440,
  viewportHeight: 900,
  pageHeight: 2400,
  overlayCoverage,
  boxes,
});

const strong = runHeuristics(sample("strong"), { url: SAMPLES.strong.url });
const weak = runHeuristics(sample("weak"), { url: SAMPLES.weak.url });

describe("signal set", () => {
  it("has at least 50 checks with unique ids across all nine categories", () => {
    for (const r of [strong, weak]) {
      expect(r.signals.length).toBeGreaterThanOrEqual(50);
      expect(new Set(r.signals.map((s) => s.id)).size).toBe(r.signals.length);
      expect(new Set(r.signals.map((s) => s.category))).toEqual(new Set(CATEGORY_IDS));
    }
  });

  it("gives every check a label, a weight of 1 to 3 and a fix", () => {
    for (const s of [...strong.signals, ...weak.signals]) {
      expect(s.label.length).toBeGreaterThan(3);
      expect([1, 2, 3]).toContain(s.weight);
      expect(s.fix?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("follows the copy rules: no em dashes anywhere", () => {
    for (const s of [...strong.signals, ...weak.signals]) {
      expect(`${s.label} ${s.evidence ?? ""} ${s.fix ?? ""}`).not.toMatch(/—/);
    }
  });

  it("skips the hero check when nothing was rendered", () => {
    expect(strong.signals.find((s) => s.id === "media-hero")).toBeUndefined();
  });
});

describe("rendered facts", () => {
  const cta = (y: number): Box => ({ kind: "cta", label: "CTA", x: 60, y, w: 160, h: 46, primary: true });

  it("judges the fold from the real button position", () => {
    const html = sample("weak");
    const at = (y: number) =>
      runHeuristics(html, { url: SAMPLES.weak.url, rendered: rendered([cta(y)]) }).signals.find((s) => s.id === "cta-above-fold")!;
    expect(at(400).status).toBe("pass");
    expect(at(1000).status).toBe("warn");
    const buried = at(1540);
    expect(buried.status).toBe("fail");
    expect(buried.evidence).toBe("Sits at 1,540px, 1.7 screens down");
  });

  it("fails a popup that covers the first screen", () => {
    const r = runHeuristics(sample("weak"), { url: SAMPLES.weak.url, rendered: { ...rendered([]), overlayCoverage: 1, overlayText: "Get 10% off" } });
    const s = r.signals.find((x) => x.id === "mobile-no-popups")!;
    expect(s.status).toBe("fail");
    expect(s.evidence).toContain("100%");
  });

  it("measures the hero image against the first screen", () => {
    const hero: Box = { kind: "hero", label: "Hero image", x: 150, y: 130, w: 600, h: 600 };
    const r = runHeuristics(sample("strong"), { url: SAMPLES.strong.url, rendered: rendered([cta(500), hero]) });
    const s = r.signals.find((x) => x.id === "media-hero")!;
    expect(s.status).toBe("pass");
    expect(s.evidence).toBe("Main image fills 28% of the first screen");
  });
});

describe("samples", () => {
  it("reads the strong page as a strong ecommerce product page", () => {
    expect(strong.classification).toMatchObject({ siteType: "ecommerce", pageType: "product" });
    expect(strong.facts).toMatchObject({ h1: "Trail Bottle 750 ml", price: "$38.00", cta: "Add to cart", reviewCount: 1284, rating: 4.8 });
    const score = scoreSignals(strong.signals, "ecommerce", "product");
    expect(score.overall).toBeGreaterThanOrEqual(90);
    const fails = strong.signals.filter((s) => s.status === "fail").map((s) => s.id);
    // DOM order alone can't see the fold; that's the one fail without a render
    expect(fails).toEqual(["cta-above-fold"]);
  });

  it("reads the weak page's real problems", () => {
    const by = Object.fromEntries(weak.signals.map((s) => [s.id, s]));
    expect(weak.facts.price).toBe("");
    expect(by["price-found"].status).toBe("fail");
    expect(by["proof-reviews"].status).toBe("fail");
    expect(by["cta-real-button"].status).toBe("warn");
    expect(by["mobile-zoom"].status).toBe("fail");
    expect(by["a11y-lang"].status).toBe("fail");
    expect(by["trust-https"].status).toBe("fail");
    expect(by["content-h1"].evidence).toContain("shares no words with the title");
    expect(scoreSignals(weak.signals, "ecommerce", "product").overall).toBeLessThan(50);
  });

  it("keeps the strong page well ahead of the weak one for every site type", () => {
    for (const site of ["ecommerce", "saas", "b2b"] as const) {
      const a = scoreSignals(strong.signals, site, "product").overall;
      const b = scoreSignals(weak.signals, site, "product").overall;
      expect(a - b).toBeGreaterThan(35);
    }
  });

  it("reports the original formula next to the new score", () => {
    expect(strong.legacy.overall_score).toBeGreaterThan(weak.legacy.overall_score);
    expect(weak.legacy.trust_social_proof).toBe(0);
  });

  it("is unsure about the weak page's type and sure about the strong one", () => {
    expect(weak.classification.confidence).toBeLessThan(strong.classification.confidence);
    expect(strong.classification.confidence).toBeGreaterThan(0.75);
  });
});
