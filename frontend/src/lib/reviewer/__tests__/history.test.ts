import { describe, expect, it } from "vitest";
import { appendRun, historyKey, parseStore, pruneStore, type HistoryEntry } from "../history";

const run = (t: number, score: number): HistoryEntry => ({ t, score, site: "ecommerce", page: "product" });

describe("historyKey", () => {
  it("keys URLs by host and path", () => {
    expect(historyKey("https://www.Allbirds.com/products/mens-tree-runners/?utm_source=x#top")).toBe("allbirds.com/products/mens-tree-runners");
    expect(historyKey("allbirds.com")).toBe("allbirds.com");
    expect(historyKey("http://allbirds.com/")).toBe("allbirds.com");
  });
  it("keys samples by id", () => {
    expect(historyKey("sample:strong")).toBe("sample:strong");
    expect(historyKey("SAMPLE:Weak")).toBe("sample:weak");
  });
});

describe("appendRun", () => {
  it("adds runs and drops a same-score double fire", () => {
    let list = appendRun([], run(1_000, 80));
    list = appendRun(list, run(2_000, 80));
    expect(list).toHaveLength(1);
    list = appendRun(list, run(9_000, 80));
    list = appendRun(list, run(10_000, 84));
    expect(list.map((r) => r.score)).toEqual([80, 80, 84]);
  });
  it("keeps the latest 24 runs", () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < 30; i += 1) list = appendRun(list, run(i * 10_000, i));
    expect(list).toHaveLength(24);
    expect(list[0].score).toBe(6);
  });
});

describe("parseStore", () => {
  it("survives garbage and drops malformed entries", () => {
    expect(parseStore(null)).toEqual({});
    expect(parseStore("{not json")).toEqual({});
    expect(parseStore("[1,2]")).toEqual({});
    expect(parseStore(JSON.stringify({ a: [run(1, 50), { t: "x" }], b: "nope" }))).toEqual({ a: [run(1, 50)] });
  });
});

describe("pruneStore", () => {
  it("keeps the 60 most recently used pages", () => {
    const store = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`p${i}`, [run(i, 1)]]));
    const pruned = pruneStore(store);
    expect(Object.keys(pruned)).toHaveLength(60);
    expect(pruned.p69).toBeDefined();
    expect(pruned.p0).toBeUndefined();
  });
});
