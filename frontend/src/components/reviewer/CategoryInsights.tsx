"use client";

import { useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { signalWeight, type SignalImpact } from "@/lib/reviewer/score";
import type { CategoryId, CategoryScore, PageType, Signal, SignalStatus, SiteType } from "@/lib/reviewer/types";
import { fmtPts, STATUS_DOT, STATUS_LABEL } from "./ui";

/* ─────────────────────────────────────────────────────────
 * CATEGORY INSIGHTS — Insight Cards, one page per category,
 * biggest leak first. Each page: the score, a pass/warn/fail
 * bar you can inspect, the checks behind it, and a pill that
 * filters the table to that category.
 * ───────────────────────────────────────────────────────── */

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const SEGMENTS: { key: SignalStatus; cls: string }[] = [
  { key: "pass", cls: "bg-green" },
  { key: "warn", cls: "bg-orange" },
  { key: "fail", cls: "bg-red" },
];

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const words = (t: string) => new Set((t.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => w !== "page"));

function prose(cat: CategoryScore, bad: Signal[]): string {
  const s = Math.round(cat.score);
  if (bad.length === 0) return `${cat.label} is solid at ${s}: every check that counts passes.`;
  const first = bad[0].evidence ?? bad[0].label;
  // a second reason only if it says something new ("no price found" and "no price on the page" are one reason)
  const seen = words(first);
  const second = bad.slice(1).find((x) => ![...words(x.evidence ?? x.label)].some((w) => seen.has(w)));
  const why = second ? `${first}, and ${lowerFirst(second.evidence ?? second.label)}` : first;
  return `${cat.label} scores ${s}. ${why.replace(/\.$/, "")}.`;
}

function Page({
  cat,
  signals,
  impact,
  site,
  page,
  onShow,
}: {
  cat: CategoryScore;
  signals: Signal[];
  impact: Record<string, SignalImpact>;
  site: SiteType;
  page: PageType;
  onShow: (c: CategoryId) => void;
}) {
  const own = signals.filter((s) => s.category === cat.id);
  const counting = own.filter((s) => signalWeight(s, site, page) > 0);
  const byLoss = [...counting].sort((a, b) => (impact[b.id]?.lost ?? 0) - (impact[a.id]?.lost ?? 0));
  const bad = byLoss.filter((s) => s.status !== "pass");
  const total = Math.max(1, cat.counts.pass + cat.counts.warn + cat.counts.fail);
  const initial: SignalStatus = cat.counts.fail ? "fail" : cat.counts.warn ? "warn" : "pass";
  const [selected, setSelected] = useState<SignalStatus>(initial);
  const list = byLoss.filter((s) => s.status === selected).slice(0, 4);

  return (
    <div style={{ animation: "fade-in 220ms ease-out both" }}>
      <p className="mt-1.5 min-h-[42px] text-[12.5px] leading-relaxed text-pretty text-ink-2">{prose(cat, bad)}</p>
      <div className="mt-2 rounded-card bg-surface p-3 shadow-hairline">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-baseline gap-1">
            <span className="num text-[28px] leading-none font-semibold tracking-[-0.02em] text-ink">{Math.round(cat.score)}</span>
            <span className="text-[12px] text-ink-3">/100</span>
          </span>
          <span className="num rounded-full bg-field px-2 py-0.5 text-[10.5px] font-medium text-ink-2" title="This category's share of the overall score">
            Weight {Math.round(cat.weight)}
          </span>
        </div>
        <div className="mt-3 flex h-9 gap-0.5 overflow-hidden rounded-full bg-field p-0.5" role="group" aria-label={`${cat.label} checks by status`}>
          {SEGMENTS.filter((seg) => cat.counts[seg.key] > 0).map((seg) => (
            <button
              key={seg.key}
              type="button"
              aria-pressed={selected === seg.key}
              aria-label={`${STATUS_LABEL[seg.key]}: ${cat.counts[seg.key]}`}
              onClick={() => setSelected(seg.key)}
              className={cn("relative h-full min-w-6 overflow-hidden rounded-full transition-[opacity,box-shadow] duration-300 active:scale-[0.98]", seg.cls)}
              style={{
                width: `${(cat.counts[seg.key] / total) * 100}%`,
                opacity: selected === seg.key ? 1 : 0.5,
                boxShadow: selected === seg.key ? "inset 0 0 0 1px rgba(255,255,255,0.22)" : undefined,
                transitionTimingFunction: EASE,
              }}
            >
              <span
                className="absolute inset-y-1 left-1 rounded-full bg-white/20 transition-[width,opacity] duration-500"
                style={{ width: selected === seg.key ? "calc(100% - 8px)" : "0%", opacity: selected === seg.key ? 1 : 0, transitionTimingFunction: EASE }}
              />
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {SEGMENTS.map((seg) => (
            <button
              key={seg.key}
              type="button"
              aria-pressed={selected === seg.key}
              disabled={cat.counts[seg.key] === 0}
              onClick={() => setSelected(seg.key)}
              className={cn(
                "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] transition-[background-color,color,transform] duration-150 active:scale-[0.96] disabled:opacity-40",
                selected === seg.key ? "bg-field text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
              )}
            >
              <span className={cn("size-1.5 rounded-full", STATUS_DOT[seg.key])} />
              {STATUS_LABEL[seg.key]} <span className="num">{cat.counts[seg.key]}</span>
            </button>
          ))}
        </div>
        <ul className="mt-3 flex min-h-[148px] flex-col gap-1 rounded-control bg-inset p-1.5 shadow-hairline">
          {list.length === 0 && <li className="px-1.5 py-2 text-[11.5px] text-ink-3">Nothing here.</li>}
          {list.map((s) => {
            const lost = impact[s.id]?.lost ?? 0;
            return (
              <li key={s.id} className="flex items-start gap-2 rounded-[6px] px-1.5 py-1.5">
                <span className={cn("mt-[5px] size-1.5 shrink-0 rounded-full", STATUS_DOT[s.status])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink">{s.label}</span>
                  {s.evidence && <span className="block truncate text-[11px] text-ink-3">{s.evidence}</span>}
                </span>
                {lost > 0.05 && <span className="num shrink-0 text-[11px] text-red">−{fmtPts(lost)}</span>}
              </li>
            );
          })}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => onShow(cat.id)}
        className="mt-2 rounded-full bg-surface px-3 py-1.5 text-left text-[12px] text-ink shadow-btn transition-colors duration-100 hover:bg-hover"
      >
        Show all {own.length} {cat.label.toLowerCase()} checks
      </button>
    </div>
  );
}

export function CategoryInsights({
  categories,
  signals,
  impact,
  site,
  page,
  onShow,
}: {
  categories: CategoryScore[];
  signals: Signal[];
  impact: Record<string, SignalImpact>;
  site: SiteType;
  page: PageType;
  onShow: (c: CategoryId) => void;
}) {
  // by id, so a rescore that re-ranks the pages keeps the one you're reading
  const [selectedId, setSelectedId] = useState<CategoryId | null>(null);
  const lostOf = (id: CategoryId) => signals.filter((s) => s.category === id).reduce((a, s) => a + (impact[s.id]?.lost ?? 0), 0);
  const pages = categories.filter((c) => c.applicable > 0).sort((a, b) => lostOf(b.id) - lostOf(a.id) || a.score - b.score);
  if (pages.length === 0) return null;
  const found = pages.findIndex((p) => p.id === selectedId);
  const i = found >= 0 ? found : 0;
  const cat = pages[i];
  const move = (d: -1 | 1) => setSelectedId(pages[(i + d + pages.length) % pages.length].id);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-semibold text-ink">Categories</span>
          <span className="num text-[13px] text-ink-3">
            {i + 1} of {pages.length}
          </span>
        </span>
        <span className="flex items-center gap-0.5">
          {([-1, 1] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-label={d < 0 ? "Previous category" : "Next category"}
              onClick={() => move(d)}
              className="flex size-6 items-center justify-center rounded-[6px] text-ink-3 transition-[background-color,color,transform] duration-100 hover:bg-hover hover:text-ink active:scale-[0.96]"
            >
              {d < 0 ? <CaretLeft size={13} weight="bold" /> : <CaretRight size={13} weight="bold" />}
            </button>
          ))}
        </span>
      </div>
      <p className="mt-0.5 text-[12px] font-medium text-ink">{cat.label}</p>
      <Page key={cat.id} cat={cat} signals={signals} impact={impact} site={site} page={page} onShow={onShow} />
    </div>
  );
}
