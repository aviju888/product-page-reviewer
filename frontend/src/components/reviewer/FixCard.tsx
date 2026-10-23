"use client";

import { useState } from "react";
import { Check, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/atoms/Button";
import { Shimmer } from "@/components/atoms/Shimmer";
import { ValuePill } from "@/components/atoms/ValuePill";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import type { Recommendation, RecommendationsEvent } from "@/lib/reviewer/types";
import { addFix, fixKey, removeFix, useFixList } from "./fix-store";
import { confidenceLevel, hostOf, IMPACT, Meter } from "./ui";

/* ─────────────────────────────────────────────────────────
 * FIX CARD — Recommendation Card, for this page's fixes.
 * The card holds its shape; "Other fixes" opens the drawer
 * and picking one promotes it. "Add to fix list" files it in
 * the header's fix list. Points = what the fix adds back.
 * ───────────────────────────────────────────────────────── */

export function FixCard({ url, recs, pending }: { url: string; recs: RecommendationsEvent | null; pending: boolean }) {
  // by id: fixes re-rank when the score is re-weighted, and the open one should stay open
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fixes = useFixList();

  if (!recs) {
    return (
      <div className="w-full overflow-hidden rounded-card bg-surface shadow-card">
        <div className="primitive-card-pad">
          <span className="text-[14px] font-medium text-ink">
            {pending ? <Shimmer>Drafting fixes from the failing checks…</Shimmer> : <span className="text-ink-2">Fixes come after the checks</span>}
          </span>
          <div className="mt-2.5 flex flex-col gap-2" aria-hidden>
            <span className="h-2 w-11/12 rounded-full bg-line" />
            <span className="h-2 w-4/5 rounded-full bg-line" />
            <span className="h-2 w-2/5 rounded-full bg-line" />
          </div>
        </div>
        <div className="primitive-card-footer flex h-[47px] items-center text-[12px] text-ink-3">Ranked by the points each fix wins back.</div>
      </div>
    );
  }

  if (recs.items.length === 0) {
    return (
      <div className="primitive-card-pad w-full rounded-card bg-surface text-[13px] text-ink-2 shadow-card">
        <span className="block text-[14px] font-medium text-ink">Nothing worth fixing</span>
        Every check that counts for this page type passes.
      </div>
    );
  }

  const found = recs.items.findIndex((r) => r.id === selectedId);
  const idx = found >= 0 ? found : 0;
  const active = recs.items[idx];
  const others = recs.items.filter((_, i) => i !== idx);
  const conf = confidenceLevel(active.confidence);
  const key = fixKey(url, active.id);
  const added = fixes.some((f) => f.key === key);

  const toggle = (r: Recommendation) => {
    const k = fixKey(url, r.id);
    if (fixes.some((f) => f.key === k)) {
      removeFix(k);
    } else {
      addFix({ key: k, url, host: hostOf(url), title: r.title, detail: r.detail, points: r.points });
      playSfx("tap");
    }
  };

  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card" style={{ animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <div className="primitive-card-pad">
        <div className="flex items-center gap-2">
          <span className="num text-[12px] text-ink-3">
            Fix {idx + 1} of {recs.items.length}
          </span>
          <span className={cn("inline-flex h-5 items-center rounded-full px-1.5 text-[11px] font-medium", IMPACT[active.impact].cls)}>{IMPACT[active.impact].label}</span>
          {active.points !== undefined && (
            <ValuePill tone="green" className="ml-auto translate-y-0">
              +{active.points.toFixed(1)} pts
            </ValuePill>
          )}
        </div>
        <div key={active.id} style={{ animation: "fade-in 180ms ease-out both" }}>
          <p className="mt-2 text-[14px] leading-snug font-medium text-balance text-ink">{active.title}</p>
          <p className="mt-1.5 min-h-12 text-[13px] leading-relaxed text-pretty text-ink-2">{active.detail}</p>
        </div>
      </div>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
        inert={!open}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line px-2 py-2">
            <p className="px-1.5 pb-1 text-[11px] font-medium text-ink-3">Other fixes</p>
            {others.map((r) => {
              const inList = fixes.some((f) => f.key === fixKey(url, r.id));
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className="flex w-full items-center gap-2.5 rounded-control px-1.5 py-1.5 text-left transition-colors duration-100 hover:bg-hover"
                >
                  <Meter level={IMPACT[r.impact].level} tone={r.impact === "high" ? "var(--red)" : r.impact === "medium" ? "var(--orange)" : "var(--ink-3)"} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{r.title}</span>
                  {inList && <Check size={12} weight="bold" className="shrink-0 text-green" aria-label="In the fix list" />}
                  {r.points !== undefined && <span className="num shrink-0 text-[11px] text-ink-3">+{r.points.toFixed(1)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="primitive-card-footer flex items-center justify-between gap-3 bg-surface">
        <span className="flex min-w-0 items-center gap-2">
          <Meter level={conf.level} tone={conf.tone} />
          <span className="truncate text-[12.5px] font-medium text-ink-2">
            <span className="sm:hidden">{conf.short}</span>
            <span className="hidden sm:inline">{conf.label}</span>
          </span>
        </span>
        <span className="-mr-0.5 flex shrink-0 items-center gap-2">
          {others.length > 0 && (
            <Button variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="px-2.5 text-[12.5px]">
              {open ? "Hide" : `Other fixes`}
              <span className="num text-ink-3">{others.length}</span>
            </Button>
          )}
          <Button variant={added ? "success" : "accent"} size="sm" onClick={() => toggle(active)} className="text-[12.5px]">
            {added ? <Check size={13} weight="bold" /> : <Plus size={13} weight="bold" />}
            {added ? "In fix list" : "Add to fix list"}
          </Button>
        </span>
      </div>
    </div>
  );
}
