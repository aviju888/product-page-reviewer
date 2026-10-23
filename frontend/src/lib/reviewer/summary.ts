import { grade, PAGE_LABELS } from "./score";
import type { PageType, ScoreResult, SiteType } from "./types";

/* The one-paragraph read of a score. Pure, so the client rewrites it on every rescore. */

function list(parts: string[]): string {
  const p = parts.filter(Boolean);
  if (p.length <= 1) return p.join("");
  return `${p.slice(0, -1).join(", ")} and ${p[p.length - 1]}`;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function summarize(
  input: { score: ScoreResult; site: SiteType; page: PageType },
  top?: { title: string; points?: number },
): string {
  const cats = input.score.categories.filter((c) => c.applicable > 0 && c.weight > 0);
  const best = [...cats].sort((a, b) => b.score - a.score).filter((c) => c.score >= 85).slice(0, 2);
  const worst = [...cats].sort((a, b) => a.score - b.score).filter((c) => c.score < 70).slice(0, 2);
  const g = grade(input.score.overall);
  const kind = { ecommerce: "an ecommerce", saas: "a SaaS", b2b: "a B2B" }[input.site];
  const parts = [`Scores ${Math.round(input.score.overall)}, ${g.word.toLowerCase()} for ${kind} ${PAGE_LABELS[input.page].toLowerCase()}.`];
  if (best.length) parts.push(`Strong on ${list(best.map((c) => c.label.toLowerCase()))}.`);
  if (worst.length) parts.push(`Weakest on ${list(worst.map((c) => `${c.label.toLowerCase()} (${Math.round(c.score)})`))}.`);
  if (top) {
    const pts = Math.max(1, Math.round(top.points ?? 0));
    parts.push(`Biggest fix: ${lowerFirst(top.title)}, worth about ${pts} ${pts === 1 ? "point" : "points"}.`);
  }
  return parts.join(" ");
}
