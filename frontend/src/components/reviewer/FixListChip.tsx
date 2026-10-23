"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardText, ListChecks, X } from "@phosphor-icons/react";
import { RollingNumber } from "@/components/craft/RollingNumber";
import { ScrollFade } from "@/components/craft/ScrollFade";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { clearFixes, fixesAsChecklist, removeFix, useFixList } from "./fix-store";

/* The header's fix list: a count that rolls as fixes are added, and a popover to review, copy, or clear them. */

export function FixListChip() {
  const fixes = useFixList();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const total = fixes.reduce((a, f) => a + (f.points ?? 0), 0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fixesAsChecklist(fixes));
      setCopied(true);
      playSfx("success", 0.5);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked; nothing to undo
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Fix list, ${fixes.length} ${fixes.length === 1 ? "fix" : "fixes"}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "press flex h-8 items-center gap-1.5 rounded-control pr-1.5 pl-2 text-[12.5px] font-medium transition-colors duration-100",
          open ? "bg-hover text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
        )}
      >
        <ListChecks size={15} weight="bold" />
        <span className="hidden sm:inline">Fix list</span>
        <span
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold transition-colors duration-200",
            fixes.length ? "bg-accent text-accent-fg" : "bg-field text-ink-3",
          )}
        >
          <RollingNumber value={fixes.length} duration={450} />
        </span>
      </button>

      {open && (
        <div
          className="absolute top-full right-0 z-50 mt-2 w-[min(340px,calc(100vw-24px))] rounded-[12px] bg-surface p-1 shadow-overlay"
          style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top right" }}
        >
          <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5">
            <span className="text-[13px] font-semibold text-ink">Fix list</span>
            {fixes.length > 0 && <span className="num text-[11.5px] text-ink-3">about +{total.toFixed(1)} pts</span>}
          </div>
          {fixes.length === 0 ? (
            <p className="px-2.5 pb-3 text-[12.5px] leading-relaxed text-pretty text-ink-3">
              Fixes you add from an audit collect here, ready to copy into a ticket.
            </p>
          ) : (
            <ScrollFade className="max-h-[320px]">
              <ul className="flex flex-col gap-px pb-1">
                {fixes.map((f) => (
                  <li key={f.key} className="group flex items-start gap-2 rounded-[8px] px-2.5 py-2 hover:bg-hover">
                    <span className="mt-[3px] size-3.5 shrink-0 rounded-[4px] shadow-[inset_0_0_0_1.5px_var(--line-strong)]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] leading-snug font-medium text-ink">{f.title}</span>
                      <span className="block truncate text-[11px] text-ink-3">
                        {f.host}
                        {f.points !== undefined && <span className="num"> · +{f.points.toFixed(1)} pts</span>}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.title}`}
                      onClick={() => removeFix(f.key)}
                      className="hit-area flex size-5 shrink-0 items-center justify-center rounded-[5px] text-ink-3 opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      <X size={11} weight="bold" />
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollFade>
          )}
          {fixes.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-line px-1.5 pt-1.5 pb-0.5">
              <button
                type="button"
                onClick={() => {
                  clearFixes();
                  setOpen(false);
                }}
                className="h-7 rounded-control px-2 text-[12px] font-medium text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={copy}
                className="press inline-flex h-7 items-center gap-1.5 rounded-control bg-ink pr-2.5 pl-2 text-[12px] font-medium text-canvas"
              >
                {copied ? <Check size={13} weight="bold" /> : <ClipboardText size={13} weight="bold" />}
                {copied ? "Copied" : "Copy as checklist"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
