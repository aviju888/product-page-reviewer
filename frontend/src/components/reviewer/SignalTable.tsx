"use client";

import { useEffect, useState } from "react";
import { CaretDown, Check, Crosshair } from "@phosphor-icons/react";
import GlideMenu from "@/components/atoms/GlideMenu";
import { ScrollFade } from "@/components/craft/ScrollFade";
import { cn } from "@/lib/cn";
import { CATEGORY_LABELS, CATEGORY_SHORT, signalWeight, SITE_LABELS, PAGE_LABELS, type SignalImpact } from "@/lib/reviewer/score";
import { CATEGORY_IDS, type BoxKind, type CategoryId, type PageType, type Signal, type SignalStatus, type SiteType } from "@/lib/reviewer/types";
import { BOX_STYLE, fmtPts, STATUS_DOT, StatusPill } from "./ui";

/* ─────────────────────────────────────────────────────────
 * SIGNAL TABLE — Filter Table, holding every check. Status
 * chips and a category menu filter it; rows fill in live as
 * the audit streams. "Pts" is what a check costs the overall
 * score right now, so the biggest leaks read at a glance.
 * ───────────────────────────────────────────────────────── */

type Filter = "all" | SignalStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "fail", label: "Fail" },
  { key: "warn", label: "Warn" },
  { key: "pass", label: "Pass" },
];

const COLS = "grid-cols-[minmax(0,1fr)_76px_44px] sm:grid-cols-[minmax(0,1.7fr)_minmax(0,0.75fr)_84px_52px]";

export function SignalTable({
  signals,
  site,
  page,
  impact,
  category,
  onCategory,
  onLocate,
  streaming,
}: {
  signals: Signal[];
  site: SiteType;
  page: PageType;
  impact: Record<string, SignalImpact>;
  category: CategoryId | "all";
  onCategory: (c: CategoryId | "all") => void;
  onLocate?: (kind: BoxKind) => void;
  streaming: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest("[data-catmenu]")) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const inCategory = category === "all" ? signals : signals.filter((s) => s.category === category);
  const count = (f: Filter) => (f === "all" ? inCategory.length : inCategory.filter((s) => s.status === f).length);

  return (
    <div className="w-full">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 py-1" style={{ scrollbarWidth: "none" }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "flex h-6.5 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-[background-color,box-shadow,color] duration-200",
                  active ? "bg-surface text-ink shadow-btn" : "text-ink-2 hover:bg-hover",
                )}
              >
                {f.key !== "all" && <span className={cn("size-1.5 rounded-full", STATUS_DOT[f.key])} />}
                {f.label}
                <span className={cn("num rounded-[4px] px-1 text-[10.5px]", active ? "bg-field text-ink-2" : "text-ink-3")}>{count(f.key)}</span>
              </button>
            );
          })}
        </div>

        <div className="relative" data-catmenu>
          <button
            type="button"
            aria-expanded={menu}
            aria-haspopup="listbox"
            onClick={() => setMenu((v) => !v)}
            className="flex h-7 items-center gap-1.5 rounded-control bg-surface pr-1.5 pl-2.5 text-[12px] font-medium text-ink-2 shadow-btn transition-colors duration-100 hover:bg-hover hover:text-ink"
          >
            {category === "all" ? "All categories" : CATEGORY_LABELS[category]}
            <CaretDown size={11} weight="bold" className="text-ink-3" />
          </button>
          {menu && (
            <div
              className="absolute top-full right-0 z-30 mt-1.5 w-48 rounded-[10px] bg-surface p-1 shadow-raised"
              style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top right" }}
              role="listbox"
            >
              <GlideMenu className="flex flex-col gap-px" highlightClassName="inset-x-0 rounded-[6px] bg-hover">
                {(["all", ...CATEGORY_IDS] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="option"
                    aria-selected={c === category}
                    data-menu-row
                    onClick={() => {
                      onCategory(c);
                      setMenu(false);
                    }}
                    className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] text-ink"
                  >
                    <span className="min-w-0 flex-1 truncate">{c === "all" ? "All categories" : CATEGORY_LABELS[c]}</span>
                    <span className="num text-[11px] text-ink-3">{c === "all" ? signals.length : signals.filter((s) => s.category === c).length}</span>
                    <Check size={12} weight="bold" className={cn("shrink-0", c !== category && "invisible")} />
                  </button>
                ))}
              </GlideMenu>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-card bg-surface shadow-card" role="region" aria-label="Checks">
        <div className={cn("grid border-b border-[var(--grid-line)] text-[12.5px] font-medium text-ink-2", COLS)}>
          <span className="border-r border-[var(--grid-line)] px-3 py-2">
            Check
          </span>
          <span className="hidden border-r border-[var(--grid-line)] px-3 py-2 sm:block">
            Category
          </span>
          <span className="border-r border-[var(--grid-line)] px-3 py-2">
            Status
          </span>
          <span className="px-2.5 py-2 text-right" title="Points this check costs the overall score right now">
            Pts
          </span>
        </div>
        <ScrollFade className="max-h-[468px]" style={{ scrollbarWidth: "thin" }}>
          {signals.length === 0 && (
            <div className="px-3 py-8 text-center text-[12.5px] text-ink-3">{streaming ? "Checks land here as they run." : "Run an audit to fill this in."}</div>
          )}
          {signals.map((s) => {
            const shown = (category === "all" || s.category === category) && (filter === "all" || s.status === filter);
            const counts = signalWeight(s, site, page) > 0;
            const lost = impact[s.id]?.lost ?? 0;
            const open = openId === s.id && shown;
            return (
              <div
                key={s.id}
                className="grid transition-[grid-template-rows,opacity] duration-300"
                style={{ gridTemplateRows: shown ? "1fr" : "0fr", opacity: shown ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
                inert={!shown}
              >
                <div className="overflow-hidden">
                  <div style={{ animation: "fade-up 320ms cubic-bezier(0.23,1,0.32,1) both" }}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : s.id)}
                      className={cn(
                        "grid w-full border-b border-[var(--grid-line)] text-left text-[13px] transition-colors duration-100 hover:bg-hover",
                        COLS,
                        open && "bg-inset",
                        !counts && "opacity-55",
                      )}
                    >
                      <span className="flex min-w-0 items-center border-r border-[var(--grid-line)] px-3 py-2">
                        <span className="truncate font-medium text-ink">{s.label}</span>
                      </span>
                      <span className="hidden min-w-0 items-center border-r border-[var(--grid-line)] px-3 py-2 text-ink-2 sm:flex">
                        <span className="truncate">{CATEGORY_LABELS[s.category]}</span>
                      </span>
                      <span className="flex items-center border-r border-[var(--grid-line)] px-2 py-2 sm:px-3">
                        <StatusPill status={s.status} />
                      </span>
                      <span
                        className={cn(
                          "num flex items-center justify-end px-2.5 py-2 text-[12.5px]",
                          !counts ? "text-ink-3" : lost > 0.05 ? (s.status === "fail" ? "text-red" : "text-orange") : "text-ink-3",
                        )}
                      >
                        {!counts ? "off" : lost > 0.05 ? `−${fmtPts(lost)}` : "0"}
                      </span>
                    </button>
                    <div
                      className="grid transition-[grid-template-rows,opacity] duration-300"
                      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
                      inert={!open}
                    >
                      <div className="overflow-hidden">
                        <div className="flex flex-col gap-1.5 border-b border-[var(--grid-line)] bg-inset px-3 py-2.5 text-[12.5px]">
                          {s.evidence && (
                            <p className="text-ink">
                              <span className="text-ink-3">Found: </span>
                              {s.evidence}
                            </p>
                          )}
                          {s.status !== "pass" && s.fix && (
                            <p className="text-pretty text-ink-2">
                              <span className="text-ink-3">Fix: </span>
                              {s.fix}
                            </p>
                          )}
                          <p className="num text-[11.5px] text-ink-3">
                            {counts
                              ? `${CATEGORY_SHORT[s.category]} · weight ${signalWeight(s, site, page).toFixed(1)} · worth ${fmtPts(impact[s.id]?.max ?? 0)} pts`
                              : `Doesn't count for ${SITE_LABELS[site]} ${PAGE_LABELS[page].toLowerCase()}s`}
                          </p>
                          {s.box && onLocate && (
                            <button
                              type="button"
                              onClick={() => onLocate(s.box!)}
                              className="press mt-0.5 inline-flex h-6.5 w-fit items-center gap-1.5 rounded-full bg-surface px-2.5 text-[11.5px] font-medium text-ink-2 shadow-btn hover:bg-hover hover:text-ink"
                            >
                              <Crosshair size={12} weight="bold" style={{ color: BOX_STYLE[s.box].color }} />
                              Show on capture
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </ScrollFade>
      </div>
    </div>
  );
}
