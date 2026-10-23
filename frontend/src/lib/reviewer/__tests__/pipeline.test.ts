import { describe, expect, it, vi } from "vitest";
import type { CaptureEvent, ClassifyEvent, RecommendationsEvent, ScoresEvent, TaskEvent } from "../types";

/* The audit pipeline with the browser unavailable: samples fall back to their raw HTML. */

vi.mock("../capture", async (orig) => {
  const real = await orig<typeof import("../capture")>();
  return {
    ...real,
    capturePage: vi.fn(async () => {
      throw new real.CaptureError("The headless browser isn't available here.");
    }),
  };
});

vi.mock("@/lib/scripted", () => ({ sleep: async () => {} }));

const { runAudit } = await import("../pipeline");

async function collect(url: string) {
  const events: { event: string; data: unknown }[] = [];
  await runAudit({ url }, (event, data) => events.push({ event, data }), new AbortController().signal);
  return events;
}

describe("runAudit without a browser", () => {
  it("still audits a sample from its HTML and says so", async () => {
    const events = await collect("sample:weak");
    const names = events.map((e) => e.event);
    expect(names.slice(0, 5)).toEqual(["task", "task", "task", "task", "task"]);

    const capture = events.find((e) => e.event === "capture")!.data as CaptureEvent;
    expect(capture.src).toBeNull();
    expect(capture.engine).toBe("sample");
    expect(capture.note).toMatch(/headless browser/i);

    const cls = events.find((e) => e.event === "classify")!.data as ClassifyEvent;
    expect(cls.siteType).toBe("ecommerce");

    const signals = events.filter((e) => e.event === "signal");
    expect(signals.length).toBeGreaterThanOrEqual(50);

    const scores = events.find((e) => e.event === "scores")!.data as ScoresEvent;
    expect(scores.overall).toBeLessThan(50);
    expect(scores.legacy.overall_score).toBeGreaterThan(0);

    const recs = events.find((e) => e.event === "recommendations")!.data as RecommendationsEvent;
    expect(recs.source).toBe("rules");
    expect(recs.items.length).toBeGreaterThan(2);

    const last = events.filter((e) => e.event === "task").map((e) => e.data as TaskEvent);
    for (const id of ["capture", "classify", "checks", "score", "report"]) {
      expect(last.filter((t) => t.id === id).at(-1)?.status).toBe("done");
    }
  });

  it("rejects private addresses before any request", async () => {
    await expect(collect("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/private network/);
  });
});
