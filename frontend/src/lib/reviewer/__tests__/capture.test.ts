import { readFileSync } from "node:fs";
import path from "node:path";
import { Script } from "node:vm";
import { afterAll, describe, expect, it } from "vitest";
import { boxScript, capturePage, looksBlocked, MAX_CAPTURE_HEIGHT, shutdownCapture } from "../capture";
import { ctaTexts, getDynamicKeywords } from "../heuristics";
import { SAMPLES } from "../samples";

/* Integration: renders the two samples in the real headless browser. */

const html = (id: "strong" | "weak") => readFileSync(path.join(process.cwd(), "public", "reviewer", "samples", SAMPLES[id].file), "utf8");
const opts = { ctaTexts: () => ctaTexts(getDynamicKeywords("ecommerce")) };

afterAll(async () => {
  await shutdownCapture();
});

describe("boxScript", () => {
  it("compiles as JavaScript (syntax check only, never run here)", () => {
    expect(() => new Script(boxScript(["add to cart", "buy now"]))).not.toThrow();
  });
});

describe("looksBlocked", () => {
  it("spots challenge pages and error statuses", () => {
    expect(looksBlocked("Just a moment...")).toBe(true);
    expect(looksBlocked("Access Denied")).toBe(true);
    expect(looksBlocked("Trail Bottle", 403)).toBe(true);
    expect(looksBlocked("Trail Bottle", 200)).toBe(false);
  });
});

describe("capturePage (Playwright)", () => {
  it("captures the strong sample with its CTA, price and hero above the fold", async () => {
    const c = await capturePage({ kind: "html", html: html("strong"), url: SAMPLES.strong.url }, opts);
    expect(c.engine).toBe("sample");
    expect(c.screenshot?.subarray(0, 3).toString("hex")).toBe("ffd8ff"); // JPEG
    expect(c.height).toBeLessThanOrEqual(MAX_CAPTURE_HEIGHT);
    const primary = c.boxes.find((b) => b.kind === "cta" && b.primary);
    expect(primary?.text).toBe("Add to cart");
    expect(primary!.y + primary!.h).toBeLessThan(900);
    expect(c.boxes.some((b) => b.kind === "price" && b.text === "$38.00")).toBe(true);
    expect(c.boxes.some((b) => b.kind === "hero")).toBe(true);
    expect(c.boxes.filter((b) => b.kind === "trust").length).toBeGreaterThanOrEqual(3);
    expect(c.rendered?.overlayCoverage).toBe(0);
  }, 30_000);

  it("finds the weak sample's buried CTA and the popup over it", async () => {
    const c = await capturePage({ kind: "html", html: html("weak"), url: SAMPLES.weak.url }, opts);
    const primary = c.boxes.find((b) => b.kind === "cta" && b.primary);
    expect(primary?.text).toBe("Add to cart");
    expect(primary!.y).toBeGreaterThan(900 * 1.5);
    expect(c.rendered?.overlayCoverage).toBeGreaterThanOrEqual(0.9);
    expect(c.rendered?.overlayText).toMatch(/10% off/);
    expect(c.boxes.some((b) => b.kind === "price")).toBe(false);
  }, 30_000);
});
