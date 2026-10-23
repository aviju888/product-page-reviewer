import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runHeuristics } from "../heuristics";
import { buildPrompt, parseLlmRecommendations, recommendRules, type RecommendInput } from "../recommend";
import { SAMPLES } from "../samples";
import { scoreSignals } from "../score";

function input(id: "strong" | "weak", withRender = true): RecommendInput {
  const html = readFileSync(path.join(process.cwd(), "public", "reviewer", "samples", SAMPLES[id].file), "utf8");
  const r = runHeuristics(html, {
    url: SAMPLES[id].url,
    rendered: withRender
      ? {
          viewportWidth: 1440,
          viewportHeight: 900,
          pageHeight: 1700,
          overlayCoverage: id === "weak" ? 1 : 0,
          overlayText: id === "weak" ? "WAIT! Don't go! Get 10% off" : undefined,
          boxes: [{ kind: "cta", label: "CTA", x: 60, y: id === "weak" ? 1540 : 508, w: 160, h: 46, primary: true }],
        }
      : null,
  });
  const site = r.classification.siteType;
  const page = r.classification.pageType;
  return { url: SAMPLES[id].url, signals: r.signals, facts: r.facts, site, page, score: scoreSignals(r.signals, site, page), rendered: withRender };
}

describe("rule recommendations", () => {
  const weak = input("weak");
  const recs = recommendRules(weak);

  it("ranks fixes by the points they'd win", () => {
    expect(recs.items.length).toBeGreaterThanOrEqual(4);
    expect(recs.items.length).toBeLessThanOrEqual(6);
    const points = recs.items.map((r) => r.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(recs.items[0].impact).toBe("high");
  });

  it("only cites checks that are failing on this page", () => {
    const status = Object.fromEntries(weak.signals.map((s) => [s.id, s.status]));
    for (const item of recs.items) {
      expect(item.signalIds.length).toBeGreaterThan(0);
      for (const id of item.signalIds) expect(status[id]).not.toBe("pass");
    }
  });

  it("writes from this page's evidence", () => {
    const text = recs.items.map((r) => `${r.title} ${r.detail}`).join(" ");
    expect(text).toContain("“Add to cart”");
    expect(text).toMatch(/1,540px|price|reviews/i);
    expect(recs.summary).toMatch(/^Scores \d+, poor/);
    expect(`${text} ${recs.summary}`).not.toMatch(/—/);
  });

  it("finds only small fixes on the strong page", () => {
    const strong = recommendRules(input("strong"));
    expect(strong.items.every((r) => r.impact !== "high")).toBe(true);
    expect(strong.items.some((r) => r.id === "weight")).toBe(true);
  });

  it("is less sure about layout fixes without a render", () => {
    const fold = recommendRules(input("weak", false)).items.find((r) => r.id === "cta-fold");
    expect(fold?.confidence ?? 0).toBeLessThan(0.9);
  });
});

describe("live recommendations (llm.py port)", () => {
  const weak = input("weak");

  it("puts failing checks in the prompt and keeps passing ones out of that list", () => {
    const prompt = buildPrompt(weak);
    const failing = prompt.split("FAILING AND WARNING SIGNALS")[1].split("PASSING SIGNALS")[0];
    expect(failing).toContain("price-found | Pricing | fail");
    expect(failing).not.toContain("mobile-viewport");
    expect(prompt).toContain("Output ONLY valid JSON");
  });

  it("grounds model output in failing checks and strips em dashes", () => {
    const parsed = parseLlmRecommendations(
      {
        summary: "Weak page — no price, no reviews.",
        items: [
          { title: "Show the price", detail: "No price — add it.", impact: "high", signal_ids: ["price-found", "made-up"], confidence: 3 },
          { title: "Fix viewport", detail: "x", impact: "low", signal_ids: ["mobile-viewport"], confidence: 1 },
          { title: "Add reviews", detail: "None on the page.", impact: "huge", signal_ids: ["proof-reviews"], confidence: "2" },
        ],
      },
      weak,
    );
    expect(parsed.source).toBe("llm");
    expect(parsed.items.map((i) => i.title)).toEqual(["Show the price", "Add reviews"]);
    expect(parsed.items[0].signalIds).toEqual(["price-found"]);
    expect(parsed.items[1].impact).toBe("medium");
    expect(parsed.summary).toBe("Weak page, no price, no reviews.");
    expect(parsed.items[0].detail).toBe("No price, add it.");
  });

  it("refuses output that isn't grounded", () => {
    expect(() =>
      parseLlmRecommendations({ summary: "ok", items: [{ title: "Do a thing", detail: "x", impact: "low", signal_ids: ["mobile-viewport"] }] }, weak),
    ).toThrow();
    expect(() => parseLlmRecommendations({ nope: true }, weak)).toThrow();
  });
});
