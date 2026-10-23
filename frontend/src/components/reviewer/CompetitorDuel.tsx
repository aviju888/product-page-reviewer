"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Sword, X } from "@phosphor-icons/react";
import { Shimmer } from "@/components/atoms/Shimmer";
import { RollingNumber } from "@/components/craft/RollingNumber";
import { cn } from "@/lib/cn";
import { CATEGORY_SHORT, CATEGORY_LABELS, grade, scoreSignals, type WeightOverrides } from "@/lib/reviewer/score";
import type { PageType, SampleId, SiteType } from "@/lib/reviewer/types";
import type { AuditState } from "./useAudit";
import { hostOf } from "./ui";

/* ─────────────────────────────────────────────────────────
 * COMPETITOR DUEL — audit a second page, then score both
 * with the same site type, page type and weights. Bars grow
 * outward from the category names: yours to the left, theirs
 * to the right; the winner of each row takes the accent.
 * ───────────────────────────────────────────────────────── */

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

function Thumb({ state, side, score }: { state: AuditState; side: "yours" | "theirs"; score: number | null }) {
  const src = state.capture?.src;
  const title = state.capture?.title || state.page?.title || hostOf(state.url);
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-2", side === "theirs" && "items-end text-right")}>
      <div className="relative aspect-[1440/900] w-full overflow-hidden rounded-[8px] bg-inset shadow-hairline">
        {src ? (

          <img src={src} alt={`First screen of ${title}`} className="image-outline absolute inset-0 h-full w-full object-cover object-top" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-ink-3">{state.phase === "running" ? "Capturing…" : "No screenshot"}</span>
        )}
      </div>
      <div className="min-w-0 max-w-full">
        <p className="text-[11px] font-medium tracking-[0.04em] text-ink-3 uppercase">{side === "yours" ? "Yours" : "Theirs"}</p>
        <p className="truncate text-[12.5px] font-medium text-ink">{title}</p>
      </div>
      <span className={cn("flex items-baseline gap-1", side === "theirs" && "flex-row-reverse")}>
        <span className="text-[30px] leading-none font-semibold tracking-[-0.03em] text-ink">
          {score === null ? <span className="text-ink-3">··</span> : <RollingNumber value={Math.round(score)} />}
        </span>
        {score !== null && <span className="text-[12px] text-ink-3">{grade(score).letter}</span>}
      </span>
    </div>
  );
}

export function CompetitorDuel({
  main,
  duel,
  site,
  page,
  overrides,
  onRun,
  onClear,
}: {
  main: AuditState;
  duel: AuditState;
  site: SiteType;
  page: PageType;
  overrides: WeightOverrides;
  onRun: (url: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState("");
  const ready = main.phase === "done" && main.signals.length > 0;
  const suggest: SampleId = main.url === "sample:weak" ? "strong" : "weak";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim()) onRun(draft.trim());
  };

  const mine = ready ? scoreSignals(main.signals, site, page, overrides) : null;
  const theirs = duel.phase === "done" && duel.signals.length ? scoreSignals(duel.signals, site, page, overrides) : null;
  const delta = mine && theirs ? Math.round(mine.overall) - Math.round(theirs.overall) : null;
  const checked = duel.signals.length;
  const running = duel.phase === "running";
  const step = Object.values(duel.tasks).find((t) => t.status === "running");

  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card">
      <div className="primitive-card-bar flex items-center justify-between gap-3 border-b border-line">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <Sword size={14} weight="bold" className="text-ink-3" />
          Compare with a competitor
        </span>
        {(theirs || duel.phase === "error") && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-6 items-center gap-1 rounded-chip px-1.5 text-[12px] font-medium text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
          >
            <X size={11} weight="bold" />
            Clear
          </button>
        )}
      </div>

      {!theirs && (
        <div className="primitive-card-pad">
          <form onSubmit={submit} className="flex items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!ready || running}
              placeholder={ready ? "Their product page URL" : "Run an audit first"}
              aria-label="Competitor URL"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className="h-8 min-w-0 flex-1 rounded-control bg-field px-2.5 text-[13px] text-ink shadow-inset-field outline-none placeholder:text-ink-3 focus-visible:shadow-[0_0_0_1px_var(--accent)] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!ready || running || !draft.trim()}
              className="press inline-flex h-8 shrink-0 items-center gap-1 rounded-control bg-ink px-3 text-[12.5px] font-medium text-canvas disabled:opacity-40"
            >
              Compare
              <ArrowRight size={13} weight="bold" />
            </button>
          </form>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
            <span>Try:</span>
            <button
              type="button"
              disabled={!ready || running}
              onClick={() => onRun(`sample:${suggest}`)}
              className="press inline-flex h-6 items-center gap-1.5 rounded-full bg-surface px-2.5 text-[12px] font-medium text-ink-2 shadow-btn hover:bg-hover hover:text-ink disabled:opacity-50"
            >
              <span className={cn("size-1.5 rounded-full", suggest === "strong" ? "bg-green" : "bg-red")} aria-hidden />
              {suggest} page
            </button>
            <span>Both get scored with your current types and weights.</span>
          </div>

          {running && (
            <div className="mt-3 rounded-control bg-inset px-3 py-2.5 shadow-hairline">
              <div className="flex items-center justify-between gap-3 text-[12.5px]">
                <Shimmer>{step ? `${step.label}…` : "Starting…"}</Shimmer>
                <span className="num text-[12px] text-ink-3">{checked > 0 ? `${checked} checks` : hostOf(duel.url)}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${Math.min(100, (Object.values(duel.tasks).filter((t) => t.status === "done").length / 5) * 100 + (checked ? 6 : 0))}%`, transitionTimingFunction: EASE }}
                />
              </div>
            </div>
          )}
          {duel.phase === "error" && (
            <p className="mt-3 rounded-control bg-red-tint px-3 py-2 text-[12.5px] text-pretty text-red">{duel.error}</p>
          )}
        </div>
      )}

      {mine && theirs && (
        <div className="primitive-card-pad" style={{ animation: "fade-up 420ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <div className="flex items-start gap-3 sm:gap-5">
            <Thumb state={main} side="yours" score={mine.overall} />
            <div className="flex shrink-0 flex-col items-center gap-1 self-center pt-6">
              <span className="text-[11px] text-ink-3">Gap</span>
              <span
                className={cn(
                  "num inline-flex h-7 items-center rounded-full px-2.5 text-[15px] font-semibold",
                  delta! > 0 ? "bg-green-tint text-green" : delta! < 0 ? "bg-red-tint text-red" : "bg-field text-ink-2",
                )}
              >
                {delta! > 0 ? "+" : delta! < 0 ? "−" : "±"}
                <RollingNumber value={Math.abs(delta!)} />
              </span>
            </div>
            <Thumb state={duel} side="theirs" score={theirs.overall} />
          </div>

          <div className="mt-4 flex flex-col gap-1.5" role="table" aria-label="Category scores, yours against theirs">
            {mine.categories.map((c, i) => {
              const t = theirs.categories[i];
              if (c.applicable === 0 && t.applicable === 0) return null;
              const a = Math.round(c.score);
              const b = Math.round(t.score);
              const win = a > b ? "mine" : b > a ? "theirs" : "tie";
              return (
                <div key={c.id} role="row" className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)]">
                  <div className="flex items-center justify-end gap-2" role="cell">
                    <span className={cn("num w-7 text-right text-[12px]", win === "mine" ? "font-semibold text-ink" : "text-ink-3")}>{a}</span>
                    <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-field">
                      <span
                        className={cn("absolute inset-y-0 right-0 rounded-full transition-[width,background-color] duration-700", win === "mine" ? "bg-accent" : "bg-line-strong")}
                        style={{ width: `${c.score}%`, transitionTimingFunction: EASE, transitionDelay: `${i * 40}ms` }}
                      />
                    </span>
                  </div>
                  <span className="truncate text-center text-[11.5px] font-medium text-ink-2" role="rowheader" title={CATEGORY_LABELS[c.id]}>
                    <span className="sm:hidden">{CATEGORY_SHORT[c.id]}</span>
                    <span className="hidden sm:inline">{CATEGORY_LABELS[c.id]}</span>
                  </span>
                  <div className="flex items-center gap-2" role="cell">
                    <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-field">
                      <span
                        className={cn("absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-700", win === "theirs" ? "bg-accent" : "bg-line-strong")}
                        style={{ width: `${t.score}%`, transitionTimingFunction: EASE, transitionDelay: `${i * 40}ms` }}
                      />
                    </span>
                    <span className={cn("num w-7 text-[12px]", win === "theirs" ? "font-semibold text-ink" : "text-ink-3")}>{b}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11.5px] text-pretty text-ink-3">
            Both scored as the same page type with the same weights. Bars in the accent color mark the winner of each row.
          </p>
        </div>
      )}
    </div>
  );
}
