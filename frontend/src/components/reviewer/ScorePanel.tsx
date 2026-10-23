"use client";

import { useState } from "react";
import { Shimmer } from "@/components/atoms/Shimmer";
import { StreamText } from "@/components/atoms/StreamText";
import type { HistoryEntry } from "@/lib/reviewer/history";
import { grade, PAGE_LABELS, SITE_LABELS } from "@/lib/reviewer/score";
import type { LegacyScores, PageType, ScoreResult, SiteType } from "@/lib/reviewer/types";
import { ScoreDial } from "./ScoreDial";
import { ScoreHistory } from "./ScoreHistory";

/* The score, what it means, and how it has moved. */

export function ScorePanel({
  runId,
  state,
  score,
  site,
  page,
  summary,
  summaryPending,
  legacy,
  checked,
  total,
  history,
  edited,
  classified,
}: {
  runId: number;
  state: "idle" | "measuring" | "scored";
  score: ScoreResult | null;
  site: SiteType;
  page: PageType;
  summary: string | null;
  summaryPending: boolean;
  legacy: LegacyScores | null;
  checked: number;
  total: number;
  history: HistoryEntry[];
  edited: boolean;
  classified: boolean;
}) {
  // stream the summary once per run, then show it plain so rescoring doesn't replay it
  const [streamed, setStreamed] = useState(0);
  const value = score?.overall ?? 0;
  const g = grade(value);

  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <ScoreDial value={value} state={state} grade={g} progress={total ? checked / total : 0} checked={checked} total={total} />
        <div className="min-w-0 flex-1 self-stretch sm:py-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-medium text-ink-2">Conversion score</span>
            {classified && (
              <span
                className="inline-flex h-5.5 items-center rounded-full bg-field px-2 text-[11.5px] font-medium text-ink-2"
                style={{ animation: "fade-in 240ms ease-out both" }}
              >
                {SITE_LABELS[site]}, {PAGE_LABELS[page].toLowerCase()}
              </span>
            )}
            {edited && (
              <span className="inline-flex h-5.5 items-center rounded-full bg-accent-tint px-2 text-[11.5px] font-medium text-accent-ink">Custom weights</span>
            )}
          </div>
          <div className="mt-2 min-h-[60px] text-[13px] leading-relaxed text-pretty text-ink-2">
            {summary ? (
              streamed === runId ? (
                summary
              ) : (
                <StreamText text={summary} wordsPerSecond={34} onDone={() => setStreamed(runId)} />
              )
            ) : summaryPending ? (
              <Shimmer>Reading the checks…</Shimmer>
            ) : state === "idle" ? (
              <span className="text-ink-3">Every check carries a weight, and the score explains itself: pick any category or check to see what it cost.</span>
            ) : (
              <span className="text-ink-3">The score lands when the checks finish.</span>
            )}
          </div>
          {legacy && (
            <p className="mt-2 text-[11.5px] text-ink-3" title="calculate_conversion_scores from the original heuristic.py, 0 to 10">
              Original formula: <span className="num font-medium text-ink-2">{legacy.overall_score.toFixed(1)}/10</span>
            </p>
          )}
        </div>
      </div>
      {history.length >= 2 && (
        <div className="mt-3 border-t border-line pt-3" style={{ animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <ScoreHistory runs={history} />
        </div>
      )}
    </div>
  );
}
