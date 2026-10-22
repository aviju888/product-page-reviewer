"use client";

import { useId, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { HistoryEntry } from "@/lib/reviewer/history";
import { cn } from "@/lib/cn";

/* ─────────────────────────────────────────────────────────
 * SCORE HISTORY — past overall scores for this URL, from the
 * viewer's localStorage. A smoothed sparkline (Catmull-Rom
 * through the runs), last run marked; hover a run for its
 * date. Shows once there are two runs to compare.
 * ───────────────────────────────────────────────────────── */

const W = 220;
const H = 48;
const PAD = 5;

/** Catmull-Rom through the points, as cubic Bézier segments */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const fmtDate = (t: number) =>
  new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function ScoreHistory({ runs, className }: { runs: HistoryEntry[]; className?: string }) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  if (runs.length < 2) return null;

  const scores = runs.map((r) => r.score);
  const lo = Math.max(0, Math.min(...scores) - 6);
  const hi = Math.min(100, Math.max(...scores) + 6);
  const span = Math.max(1, hi - lo);
  const pts = runs.map((r, i) => ({
    x: PAD + (i / (runs.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - (r.score - lo) / span) * (H - PAD * 2),
  }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;
  const last = runs[runs.length - 1];
  const prev = runs[runs.length - 2];
  const delta = Math.round(last.score - prev.score);
  const active = hover ?? runs.length - 1;

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(pts[best].x - x)) best = i;
    });
    setHover(best);
  };

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="min-w-0 shrink-0">
        <p className="text-[12px] font-medium text-ink">History</p>
        <p className="num mt-0.5 text-[11.5px] text-ink-3">
          {runs.length} runs
          <span className={cn("ml-1.5 font-medium", delta > 0 ? "text-green" : delta < 0 ? "text-red" : "text-ink-3")}>
            {delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "±0"}
          </span>
        </p>
      </div>
      <div className="relative min-w-0 flex-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-12 w-full touch-pan-y overflow-visible"
          preserveAspectRatio="none"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Score history: ${runs.map((r) => Math.round(r.score)).join(", ")}`}
        >
          <defs>
            <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#fill-${gid})`} />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && <line x1={pts[hover].x} x2={pts[hover].x} y1={0} y2={H} stroke="var(--ink)" strokeOpacity="0.2" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* dots sit in HTML so they stay round when the svg stretches */}
        {pts.map((p, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full",
              i === active ? "bg-accent ring-2 ring-surface" : "bg-line-strong",
            )}
            style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}
          />
        ))}
        {hover !== null && (
          <span
            className="insight-chart-tooltip pointer-events-none absolute -top-8 -translate-x-1/2"
            style={{ left: `${Math.min(Math.max((pts[hover].x / W) * 100, 22), 78)}%` }}
          >
            <span className="num">{Math.round(runs[hover].score)}</span>
            <span className="text-[var(--tooltip-muted)]">{fmtDate(runs[hover].t)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
