import type { PageType, SiteType } from "./types";
import { sampleIdOf } from "./samples";

/* ─────────────────────────────────────────────────────────
 * SCORE HISTORY — past overall scores per URL, kept in the
 * viewer's localStorage. Pure helpers plus guarded storage
 * access (private windows and blocked storage just return
 * an empty history).
 * ───────────────────────────────────────────────────────── */

export type HistoryEntry = { t: number; score: number; site: SiteType; page: PageType };
export type HistoryStore = Record<string, HistoryEntry[]>;

export const HISTORY_KEY = "reviewer:history:v1";
const MAX_RUNS = 24;
const MAX_URLS = 60;

/** One key per page: samples by id, URLs by host + path (no query, no trailing slash). */
export function historyKey(input: string): string {
  const sample = sampleIdOf(input);
  if (sample) return `sample:${sample}`;
  try {
    const raw = /^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path === "/" ? "" : path}`;
  } catch {
    return input.trim().toLowerCase();
  }
}

function isEntry(v: unknown): v is HistoryEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return typeof e.t === "number" && typeof e.score === "number" && typeof e.site === "string" && typeof e.page === "string";
}

export function parseStore(raw: string | null): HistoryStore {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: HistoryStore = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.filter(isEntry).slice(-MAX_RUNS);
    }
    return out;
  } catch {
    return {};
  }
}

/** Appends a run; a repeat of the same score within 5s (a double fire) is dropped. */
export function appendRun(list: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const last = list[list.length - 1];
  if (last && entry.t - last.t < 5000 && last.score === entry.score) return list;
  return [...list, entry].slice(-MAX_RUNS);
}

/** Keeps the store bounded: the most recently used URLs win. */
export function pruneStore(store: HistoryStore): HistoryStore {
  const keys = Object.keys(store);
  if (keys.length <= MAX_URLS) return store;
  const ranked = keys.sort((a, b) => (store[b].at(-1)?.t ?? 0) - (store[a].at(-1)?.t ?? 0)).slice(0, MAX_URLS);
  return Object.fromEntries(ranked.map((k) => [k, store[k]]));
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadHistory(url: string): HistoryEntry[] {
  try {
    return parseStore(storage()?.getItem(HISTORY_KEY) ?? null)[historyKey(url)] ?? [];
  } catch {
    return [];
  }
}

export function recordRun(url: string, entry: HistoryEntry): HistoryEntry[] {
  const key = historyKey(url);
  try {
    const s = storage();
    const store = parseStore(s?.getItem(HISTORY_KEY) ?? null);
    const next = appendRun(store[key] ?? [], entry);
    store[key] = next;
    s?.setItem(HISTORY_KEY, JSON.stringify(pruneStore(store)));
    return next;
  } catch {
    return [entry];
  }
}
