"use client";

import { useEffect, useRef, useState } from "react";
import GlideMenu from "@/components/atoms/GlideMenu";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { CATEGORY_LABELS, CATEGORY_SHORT, defaultWeights, resolveWeights, SITE_LABELS, type WeightOverrides } from "@/lib/reviewer/score";
import { CATEGORY_IDS, SITE_TYPES, type CategoryId, type PageType, type SiteType } from "@/lib/reviewer/types";

/* ─────────────────────────────────────────────────────────
 * WEIGHTS CARD — Fine-tune Card as a scoring inspector.
 * Each category weight is a scrub field: drag the label for
 * ↔, use ↑/↓ (⇧ for ×10), or type. Every change re-scores
 * client-side and the dial rolls. The segmented control is
 * the page type; the menu is the site type.
 * ───────────────────────────────────────────────────────── */

const MAX = 40;

function ScrubField({
  label,
  title,
  value,
  onChange,
  active,
}: {
  label: string;
  title: string;
  value: number;
  onChange: (v: number) => void;
  active?: boolean;
}) {
  const drag = useRef<{ x: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(MAX, Math.max(0, Math.round(v)));

  return (
    <label
      className="flex h-6.5 min-w-0 items-center gap-1 rounded-chip py-1 pr-1 pl-0.5 transition-[background-color,box-shadow] duration-200"
      style={{ background: active ? "var(--accent-tint)" : "var(--field)", boxShadow: active ? "0 0 0 1px var(--accent)" : "none" }}
      title={title}
    >
      <span
        role="slider"
        aria-label={`${title} weight`}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={MAX}
        tabIndex={0}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const next = clamp(drag.current.v + (e.clientX - drag.current.x) / 4);
          if (next !== value) {
            onChange(next);
            playSfx("tick", 0.4);
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          const mult = e.shiftKey ? 10 : 1;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            onChange(clamp(value + mult));
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            onChange(clamp(value - mult));
          }
        }}
        className="flex h-full shrink-0 cursor-ew-resize touch-none items-center rounded-[4px] px-0.5 text-[12px] text-ink-3 select-none hover:text-ink-2 focus-visible:text-accent-ink focus-visible:outline-none"
      >
        {label}
      </span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^\d]/g, ""));
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        aria-label={`${title} weight value`}
        className="num min-w-0 flex-1 bg-transparent text-right text-[12px] text-ink outline-none"
      />
    </label>
  );
}

const PAGES: { key: PageType; label: string }[] = [
  { key: "product", label: "Product" },
  { key: "homepage", label: "Home" },
  { key: "category", label: "Category" },
];

export function WeightsCard({
  site,
  page,
  overrides,
  onSite,
  onPage,
  onWeight,
  onReset,
  disabled,
}: {
  site: SiteType;
  page: PageType;
  overrides: WeightOverrides;
  onSite: (s: SiteType) => void;
  onPage: (p: PageType) => void;
  onWeight: (c: CategoryId, v: number) => void;
  onReset: () => void;
  disabled?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const weights = resolveWeights(site, page, overrides);
  const base = defaultWeights(site, page);
  const edited = CATEGORY_IDS.some((id) => overrides[id] !== undefined && overrides[id] !== base[id]);
  const seg = PAGES.findIndex((p) => p.key === page);
  const sum = CATEGORY_IDS.reduce((a, id) => a + weights[id], 0);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest("[data-sitemenu]")) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  return (
    <div className={cn("relative w-full rounded-card bg-surface shadow-raised", disabled && "pointer-events-none opacity-60")} aria-disabled={disabled}>
      <div className="primitive-card-bar flex items-center justify-between border-b border-line">
        <span className="text-[13px] font-medium text-ink">Weights</span>
        {edited ? (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-green" style={{ animation: "pop-in 250ms cubic-bezier(0.23,1,0.32,1) both" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Edited
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="flex size-4.5 items-center justify-center rounded-[5px] border border-accent/30 bg-accent-tint" aria-hidden>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="var(--accent)">
                <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
              </svg>
            </span>
            <span
              className="bg-clip-text text-[12px] font-medium text-transparent"
              style={{
                backgroundImage: "linear-gradient(90deg, var(--accent) 35%, var(--accent-ink) 50%, var(--accent) 65%)",
                backgroundSize: "200% 100%",
                animation: "shimmer-text 1.4s linear infinite",
              }}
            >
              Drag to adjust
            </span>
          </span>
        )}
      </div>

      <div className="primitive-card-pad flex flex-col gap-2 border-b border-line">
        <p className="text-[12.5px] font-medium text-ink">Page type</p>
        <div className="relative grid grid-cols-3 rounded-control bg-field p-0.5">
          <span
            aria-hidden
            className="absolute inset-y-0.5 rounded-[6px] bg-surface shadow-btn transition-transform duration-300"
            style={{
              width: "calc((100% - 4px) / 3)",
              left: 2,
              transform: `translateX(${Math.max(0, seg) * 100}%)`,
              transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          />
          {PAGES.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={p.key === page}
              onClick={() => {
                onPage(p.key);
                playSfx("toggle");
              }}
              className={cn("relative z-10 flex h-6 items-center justify-center text-[12px] font-medium transition-colors duration-200", p.key === page ? "text-accent-ink" : "text-ink-3 hover:text-ink-2")}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-[12.5px] font-medium text-ink">Category weights</p>
          <span className="num text-[11px] text-ink-3" title="Weights are relative; the score divides by their sum">
            Sum {sum}
          </span>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          {CATEGORY_IDS.map((id) => (
            <ScrubField
              key={id}
              label={CATEGORY_SHORT[id]}
              title={CATEGORY_LABELS[id]}
              value={weights[id]}
              onChange={(v) => onWeight(id, v)}
              active={overrides[id] !== undefined && overrides[id] !== base[id]}
            />
          ))}
        </div>
      </div>

      <div className="primitive-card-footer flex items-center justify-between gap-2">
        <div className="relative" data-sitemenu>
          <button
            type="button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-6.5 w-32 items-center justify-between rounded-chip bg-inset py-1 pr-1 pl-2 shadow-hairline transition-shadow duration-200 focus-visible:outline-none"
            style={{ boxShadow: menuOpen ? "0 0 0 1px var(--accent)" : undefined }}
          >
            <span className="text-[12px] text-ink">
              <span className="text-ink-3">Site </span>
              {SITE_LABELS[site]}
            </span>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--ink-3)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-200"
              style={{ transform: menuOpen ? "rotate(180deg)" : "rotate(0)" }}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="absolute bottom-8 left-0 z-10 w-32 rounded-[10px] bg-surface p-1 shadow-raised"
              style={{ animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom left" }}
            >
              <GlideMenu className="flex flex-col gap-px" highlightClassName="inset-x-0 rounded-[6px] bg-field">
                {SITE_TYPES.map((t) => (
                  <button
                    key={t}
                    data-menu-row
                    type="button"
                    onClick={() => {
                      onSite(t);
                      setMenuOpen(false);
                      playSfx("tap");
                    }}
                    className={cn(
                      "relative z-10 flex h-6.5 w-full items-center rounded-[6px] px-2 text-left text-[12.5px] text-ink",
                      t === site && "bg-field group-hover/glide-menu:bg-transparent",
                    )}
                  >
                    {SITE_LABELS[t]}
                  </button>
                ))}
              </GlideMenu>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={!edited}
          onClick={() => {
            onReset();
            playSfx("toggle");
          }}
          className="h-6.5 rounded-chip px-2 text-[12px] font-medium text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink disabled:opacity-40"
        >
          Reset weights
        </button>
      </div>
    </div>
  );
}
