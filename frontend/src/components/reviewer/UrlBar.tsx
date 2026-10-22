"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, CaretDown, Check, LinkSimple, Stop } from "@phosphor-icons/react";
import GlideMenu from "@/components/atoms/GlideMenu";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import type { SampleId, SiteType } from "@/lib/reviewer/types";

/* ─────────────────────────────────────────────────────────
 * URL BAR — Prompt Bar's composer, re-purposed: a URL field,
 * a site-type picker where the model picker was, and a send
 * square that turns into stop while an audit runs.
 * ───────────────────────────────────────────────────────── */

type Choice = "auto" | SiteType;

const OPTIONS: { key: Choice; name: string; desc: string }[] = [
  { key: "auto", name: "Auto", desc: "Detect from the page" },
  { key: "ecommerce", name: "Ecommerce", desc: "Stores and product pages" },
  { key: "saas", name: "SaaS", desc: "Software with plans" },
  { key: "b2b", name: "B2B", desc: "Sales-led products" },
];

export function UrlBar({
  value,
  onChange,
  siteType,
  onSiteType,
  running,
  onSubmit,
  onStop,
  onSample,
  autoFocus,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  siteType: Choice;
  onSiteType: (v: Choice) => void;
  running: boolean;
  onSubmit: (url: string) => void;
  onStop: () => void;
  onSample: (id: SampleId) => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = OPTIONS.find((o) => o.key === siteType) ?? OPTIONS[0];
  const canSend = value.trim().length > 0;

  // close the picker on outside press or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest("[data-urlbar]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (running) return;
    if (!canSend) {
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
    onSubmit(value.trim());
  };

  return (
    <form data-urlbar onSubmit={submit} className="w-full">
      <div className="relative">
        {open && (
          <div
            className="absolute right-10 bottom-full z-30 mb-2 w-56 rounded-[10px] bg-surface p-1 shadow-raised"
            style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom right" }}
            role="listbox"
            aria-label="Score as"
          >
            <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium text-ink-3">Score the page as</p>
            <GlideMenu className="flex flex-col gap-px" highlightClassName="inset-x-0 rounded-[6px] bg-hover">
              {OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={o.key === siteType}
                  data-menu-row
                  onClick={() => {
                    onSiteType(o.key);
                    setOpen(false);
                    playSfx("tap");
                    inputRef.current?.focus();
                  }}
                  className="relative z-10 flex h-9 w-full items-center gap-2 rounded-[6px] px-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-ink">{o.name}</span>
                    <span className="block truncate text-[11px] text-ink-3">{o.desc}</span>
                  </span>
                  <Check size={13} weight="bold" className={cn("shrink-0 text-ink", o.key !== siteType && "invisible")} />
                </button>
              ))}
            </GlideMenu>
          </div>
        )}

        <div
          className={cn(
            "relative flex items-center gap-1 rounded-[14px] border border-line bg-surface p-1.5 shadow-card transition-[border-color] duration-150 focus-within:border-line-strong",
            compact ? "" : "sm:p-2",
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center text-ink-3" aria-hidden>
            <LinkSimple size={15} weight="bold" />
          </span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste a product page URL"
            aria-label="Product page URL"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            autoFocus={autoFocus}
            className={cn(
              "h-7 min-w-0 flex-1 bg-transparent px-1 text-ink outline-none placeholder:text-ink-3",
              compact ? "text-[13px]" : "text-[13.5px]",
            )}
          />
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={`Score as: ${current.name}`}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-1.5 text-[12px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink",
              open && "bg-hover text-ink",
            )}
          >
            {current.name}
            <CaretDown size={11} weight="bold" className="text-ink-3" />
          </button>
          {running ? (
            <button
              type="button"
              aria-label="Stop the audit"
              onClick={onStop}
              className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-ink text-surface transition-transform duration-150 active:scale-[0.94]"
            >
              <Stop size={13} weight="fill" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Audit this page"
              disabled={!canSend}
              className="flex size-7 shrink-0 items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94]"
              style={{ background: canSend ? "var(--ink)" : "var(--line-strong)", color: canSend ? "var(--surface)" : "var(--ink-2)" }}
            >
              <ArrowUp size={15} weight="bold" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 px-0.5 text-[12.5px] text-ink-3">
        <span>Try:</span>
        {(["strong", "weak"] as const).map((id) => (
          <button
            key={id}
            type="button"
            disabled={running}
            onClick={() => onSample(id)}
            className="press inline-flex h-6.5 items-center gap-1.5 rounded-full bg-surface px-2.5 text-[12px] font-medium text-ink-2 shadow-btn transition-colors duration-100 hover:bg-hover hover:text-ink disabled:opacity-50"
          >
            <span className={cn("size-1.5 rounded-full", id === "strong" ? "bg-green" : "bg-red")} aria-hidden />
            {id} page
          </button>
        ))}
        <span className="ml-auto hidden text-[11.5px] sm:inline">Fictional pages, audited by the same engine</span>
      </div>
    </form>
  );
}
