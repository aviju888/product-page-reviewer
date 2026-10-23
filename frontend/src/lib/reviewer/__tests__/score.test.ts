import { describe, expect, it } from "vitest";
import { defaultWeights, grade, resolveWeights, scoreSignals, signalImpact, signalWeight } from "../score";
import { CATEGORY_IDS, PAGE_TYPES, SITE_TYPES, type Signal } from "../types";

const sig = (id: string, category: Signal["category"], status: Signal["status"], weight = 1): Signal => ({
  id,
  category,
  label: id,
  status,
  weight,
});

describe("defaultWeights", () => {
  it("gives integer weights that add up to 100 for every site and page type", () => {
    for (const site of SITE_TYPES) {
      for (const page of PAGE_TYPES) {
        const w = defaultWeights(site, page);
        const values = CATEGORY_IDS.map((id) => w[id]);
        expect(values.every(Number.isInteger)).toBe(true);
        expect(values.reduce((a, b) => a + b, 0)).toBe(100);
      }
    }
  });

  it("tilts weights by site type", () => {
    expect(defaultWeights("b2b", "product").pricing).toBeLessThan(defaultWeights("ecommerce", "product").pricing);
    expect(defaultWeights("b2b", "product").trust).toBeGreaterThan(defaultWeights("ecommerce", "product").trust);
  });

  it("keeps overrides that are valid numbers", () => {
    const w = resolveWeights("ecommerce", "product", { cta: 40, pricing: -3, trust: Number.NaN });
    expect(w.cta).toBe(40);
    expect(w.pricing).toBe(defaultWeights("ecommerce", "product").pricing);
    expect(w.trust).toBe(defaultWeights("ecommerce", "product").trust);
  });
});

describe("scoreSignals", () => {
  it("weights credit inside a category: pass 1, warn .5, fail 0", () => {
    const r = scoreSignals([sig("a", "cta", "pass", 3), sig("b", "cta", "fail", 1)], "ecommerce", "product");
    expect(r.categories.find((c) => c.id === "cta")?.score).toBe(75);
    // only one category applies, so the overall is that category
    expect(r.overall).toBe(75);
  });

  it("counts warnings as half", () => {
    const r = scoreSignals([sig("a", "media", "warn", 2)], "ecommerce", "product");
    expect(r.overall).toBe(50);
  });

  it("drops checks that don't apply to the site type", () => {
    const signals = [sig("cta-found", "cta", "pass", 3), sig("cta-delivery", "cta", "fail", 2)];
    expect(scoreSignals(signals, "ecommerce", "product").overall).toBe(60);
    expect(scoreSignals(signals, "saas", "product").overall).toBe(100);
    expect(signalWeight(signals[1], "saas", "product")).toBe(0);
  });

  it("re-weights categories with overrides", () => {
    const signals = [sig("a", "cta", "pass"), sig("b", "pricing", "fail")];
    const zeroPricing = Object.fromEntries(CATEGORY_IDS.map((id) => [id, id === "cta" ? 10 : 0]));
    expect(scoreSignals(signals, "ecommerce", "product", zeroPricing).overall).toBe(100);
    const even = Object.fromEntries(CATEGORY_IDS.map((id) => [id, 10]));
    expect(scoreSignals(signals, "ecommerce", "product", even).overall).toBe(50);
  });

  it("counts statuses per category", () => {
    const r = scoreSignals([sig("a", "trust", "pass"), sig("b", "trust", "warn"), sig("c", "trust", "fail")], "ecommerce", "product");
    expect(r.categories.find((c) => c.id === "trust")?.counts).toEqual({ pass: 1, warn: 1, fail: 1 });
  });

  it("is 0 with nothing to score", () => {
    expect(scoreSignals([], "saas", "homepage").overall).toBe(0);
  });
});

describe("signalImpact", () => {
  it("splits 100 points across the checks that count", () => {
    const signals = [
      sig("a", "cta", "pass", 3),
      sig("b", "cta", "fail", 1),
      sig("c", "trust", "warn", 2),
      sig("cta-delivery", "cta", "fail", 2),
    ];
    const impact = signalImpact(signals, "saas", "product");
    const total = Object.values(impact).reduce((a, i) => a + i.max, 0);
    expect(total).toBeCloseTo(100, 6);
    expect(impact.a.lost).toBe(0);
    expect(impact.c.lost).toBeCloseTo(impact.c.max / 2, 6);
    expect(impact["cta-delivery"]).toEqual({ max: 0, lost: 0 });
  });

  it("adds back exactly the points a fix would win", () => {
    const signals = [sig("a", "cta", "fail", 2), sig("b", "cta", "pass", 2), sig("c", "pricing", "pass", 1)];
    const before = scoreSignals(signals, "ecommerce", "product").overall;
    const lost = signalImpact(signals, "ecommerce", "product").a.lost;
    const after = scoreSignals([{ ...signals[0], status: "pass" }, signals[1], signals[2]], "ecommerce", "product").overall;
    expect(after - before).toBeCloseTo(lost, 0);
  });
});

describe("grade", () => {
  it("maps scores to letters", () => {
    expect(grade(95).letter).toBe("A");
    expect(grade(84).letter).toBe("B");
    expect(grade(70).letter).toBe("C");
    expect(grade(60).letter).toBe("D");
    expect(grade(20)).toEqual({ letter: "F", word: "Poor" });
  });
});
