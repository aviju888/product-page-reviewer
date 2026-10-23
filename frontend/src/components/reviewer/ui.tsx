"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { BoxKind, Impact, SignalStatus } from "@/lib/reviewer/types";

/* Small shared pieces for the reviewer UI. */

const noop = () => () => {};

/** true after hydration; for portals and other browser-only bits */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export const STATUS_LABEL: Record<SignalStatus, string> = { pass: "Pass", warn: "Warn", fail: "Fail" };

export const STATUS_DOT: Record<SignalStatus, string> = { pass: "bg-green", warn: "bg-orange", fail: "bg-red" };

const STATUS_PILL: Record<SignalStatus, string> = {
  pass: "bg-green-tint text-green",
  warn: "bg-orange-tint text-orange",
  fail: "bg-red-tint text-red",
};

export function StatusPill({ status, className }: { status: SignalStatus; className?: string }) {
  return (
    <span className={cn("inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium", STATUS_PILL[status], className)}>
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** three bars, like the Recommendation Card's confidence meter */
export function Meter({ level, tone }: { level: 0 | 1 | 2 | 3; tone: string }) {
  return (
    <span className="flex items-end gap-0.5" aria-hidden>
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-full transition-colors duration-300"
          style={{ height: 10, background: bar < level ? tone : "var(--line-strong)" }}
        />
      ))}
    </span>
  );
}

export function confidenceLevel(c: number): { level: 1 | 2 | 3; label: string; short: string; tone: string } {
  if (c >= 0.8) return { level: 3, label: "High confidence", short: "High", tone: "var(--green)" };
  if (c >= 0.6) return { level: 2, label: "Medium confidence", short: "Medium", tone: "var(--orange)" };
  return { level: 1, label: "Low confidence", short: "Low", tone: "var(--ink-3)" };
}

export const IMPACT: Record<Impact, { label: string; cls: string; level: 1 | 2 | 3 }> = {
  high: { label: "High impact", cls: "bg-red-tint text-red", level: 3 },
  medium: { label: "Medium impact", cls: "bg-orange-tint text-orange", level: 2 },
  low: { label: "Low impact", cls: "bg-field text-ink-2", level: 1 },
};

/** X-ray colors: saturated enough to read over any screenshot */
export const BOX_STYLE: Record<BoxKind, { color: string; label: string }> = {
  cta: { color: "oklch(58% 0.22 285)", label: "CTA" },
  price: { color: "oklch(60% 0.16 150)", label: "Price" },
  trust: { color: "oklch(68% 0.17 55)", label: "Trust" },
  reviews: { color: "oklch(64% 0.2 350)", label: "Reviews" },
  hero: { color: "oklch(64% 0.13 215)", label: "Hero image" },
  h1: { color: "oklch(56% 0.18 255)", label: "H1" },
  form: { color: "oklch(55% 0.03 260)", label: "Form" },
};

export function hostOf(url: string): string {
  if (url.startsWith("sample:")) return url;
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const fmtPts = (v: number) => (Math.abs(v) < 0.05 ? "0" : v.toFixed(1));

export function SectionLabel({ children, count, right }: { children: ReactNode; count?: number; right?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
      <span className="flex items-baseline gap-1.5">
        <span className="text-[13px] font-semibold text-ink">{children}</span>
        {count !== undefined && <span className="num text-[13px] text-ink-3">{count}</span>}
      </span>
      {right}
    </div>
  );
}
