"use client";

import { RollingNumber } from "@/components/craft/RollingNumber";
import { cn } from "@/lib/cn";
import type { Grade } from "@/lib/reviewer/score";
import styles from "./reviewer.module.css";

/* ─────────────────────────────────────────────────────────
 * SCORE DIAL — a 270° gauge.
 *   track      line color, round caps
 *   value      accent stroke; dashoffset transitions, so a
 *              rescore mid-roll simply retargets
 *   knob       rides the end of the arc on the same curve
 *   ticks      every 10 points light up as the arc passes
 *   center     RollingNumber + grade
 * While checks stream in, a faint arc shows progress.
 * ───────────────────────────────────────────────────────── */

const C = 100;
const R = 80;
const START = 135;
const SWEEP = 270;
const LEN = (R * Math.PI * SWEEP) / 180;
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const TICKS = Array.from({ length: 11 }, (_, i) => i / 10);

/** rounded so server and browser trig agree to the last digit (no hydration mismatch) */
const round = (v: number) => Math.round(v * 100) / 100;

function point(deg: number, r = R) {
  const rad = (deg * Math.PI) / 180;
  return { x: round(C + r * Math.cos(rad)), y: round(C + r * Math.sin(rad)) };
}

const a = point(START);
const b = point(START + SWEEP);
const ARC = `M ${a.x} ${a.y} A ${R} ${R} 0 1 1 ${b.x} ${b.y}`;

const TONE: Record<Grade["letter"], string> = {
  A: "text-green",
  B: "text-green",
  C: "text-orange",
  D: "text-red",
  F: "text-red",
};

export function ScoreDial({
  value,
  state,
  grade,
  progress = 0,
  checked = 0,
  total = 0,
  size = 184,
  className,
}: {
  value: number;
  state: "idle" | "measuring" | "scored";
  grade?: Grade;
  /** 0..1, checks streamed so far */
  progress?: number;
  checked?: number;
  total?: number;
  size?: number;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, state === "scored" ? value : 0));
  const deg = START + (SWEEP * v) / 100;
  const transition = `900ms ${EASE}`;

  return (
    <div
      className={cn("relative shrink-0", state === "idle" && "opacity-40", className)}
      style={{ width: size, height: size }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={state === "scored" ? Math.round(v) : undefined}
      aria-label={state === "scored" ? `Score ${Math.round(v)} of 100${grade ? `, ${grade.word}` : ""}` : "Score not ready"}
    >
      <svg viewBox="0 0 200 200" width={size} height={size} className="absolute inset-0 overflow-visible" aria-hidden>
        {TICKS.map((t) => {
          const d = START + SWEEP * t;
          const p1 = point(d, 93);
          const p2 = point(d, t === 0 || t === 0.5 || t === 1 ? 99 : 97);
          const lit = state === "scored" && t <= v / 100 + 0.001;
          return (
            <line
              key={t}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              strokeWidth={1.5}
              strokeLinecap="round"
              style={{
                stroke: lit ? "var(--accent)" : "var(--line-strong)",
                transition: `stroke 240ms ease-out ${lit ? t * 600 : 0}ms`,
              }}
            />
          );
        })}
        <path d={ARC} fill="none" stroke="var(--line-strong)" strokeWidth={12} strokeLinecap="round" />
        {state === "measuring" && (
          <path
            d={ARC}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={LEN}
            className={styles.pulse}
            style={{ strokeDashoffset: LEN * (1 - Math.max(0.02, progress)), transition: `stroke-dashoffset 300ms ${EASE}` }}
          />
        )}
        <path
          d={ARC}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={LEN}
          style={{ strokeDashoffset: LEN * (1 - v / 100), opacity: v > 0 ? 1 : 0, transition: `stroke-dashoffset ${transition}, opacity 200ms ease-out` }}
        />
        <g style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${C}px ${C}px`, transition: `transform ${transition}`, opacity: v > 0 ? 1 : 0 }}>
          <circle cx={C + R} cy={C} r={8.5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={3.5} />
        </g>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
        {state === "measuring" ? (
          total > 0 ? (
            <>
              <span className="num text-[26px] leading-none font-semibold tracking-[-0.02em] text-ink-2">
                {checked}
                <span className="text-ink-3">/{total}</span>
              </span>
              <span className="mt-1.5 text-[12px] text-ink-3">checks run</span>
            </>
          ) : (
            <span className="text-[13px] font-medium text-ink-3">Capturing</span>
          )
        ) : (
          <>
            <RollingNumber
              value={Math.round(v)}
              duration={900}
              className={cn("text-[48px] leading-none font-semibold tracking-[-0.035em]", state === "scored" ? "text-ink" : "text-ink-3")}
            />
            <span className={cn("mt-1.5 text-[12.5px] font-medium", grade && state === "scored" ? TONE[grade.letter] : "text-ink-3")}>
              {state === "scored" && grade ? `${grade.letter} · ${grade.word}` : "of 100"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
