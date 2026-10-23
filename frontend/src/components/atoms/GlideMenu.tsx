"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/* ─────────────────────────────────────────────────────────
 * GLIDE MENU — one highlight that follows the hovered row.
 *
 * Rows opt in with `data-menu-row` (or a custom rowSelector) and
 * sit above the highlight with `relative z-10`.
 *
 * craft (Hover Restraint): the highlight appears instantly on the
 * first row you touch; it only glides when moving between rows.
 * ───────────────────────────────────────────────────────── */

type Box = { top: number; height: number };

export default function GlideMenu({
  children,
  className,
  highlightClassName = "inset-x-0 rounded-[6px] bg-hover",
  rowSelector = "[data-menu-row]",
}: {
  children: ReactNode;
  className?: string;
  highlightClassName?: string;
  rowSelector?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [gliding, setGliding] = useState(false);

  const measure = useCallback((row: HTMLElement): Box | null => {
    const host = hostRef.current;
    if (!host) return null;
    const h = host.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    return { top: r.top - h.top, height: r.height };
  }, []);

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const row = (e.target as HTMLElement).closest(rowSelector) as HTMLElement | null;
      if (!row || !host.contains(row) || row.hasAttribute("disabled")) return;
      if (row === rowRef.current) return;
      const next = measure(row);
      if (!next) return;
      setGliding(rowRef.current !== null);
      rowRef.current = row;
      setBox(next);
    },
    [measure, rowSelector],
  );

  // keep the highlight glued to its row if the menu reflows
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const row = rowRef.current;
      if (!row) return;
      if (!host.contains(row)) {
        rowRef.current = null;
        setBox(null);
        return;
      }
      const next = measure(row);
      if (next) setBox(next);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div
      ref={hostRef}
      className={cn("relative", className)}
      onPointerMove={onMove}
      onPointerLeave={() => {
        rowRef.current = null;
        setBox(null);
        setGliding(false);
      }}
    >
      <span
        aria-hidden
        className={cn("pointer-events-none absolute z-0", highlightClassName)}
        style={{
          top: box?.top ?? 0,
          height: box?.height ?? 0,
          opacity: box ? 1 : 0,
          transition: gliding
            ? "top 160ms cubic-bezier(0.23,1,0.32,1), height 160ms cubic-bezier(0.23,1,0.32,1)"
            : "none",
        }}
      />
      {children}
    </div>
  );
}
