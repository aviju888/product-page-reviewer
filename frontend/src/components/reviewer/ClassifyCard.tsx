"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaretDown, CaretUp, X } from "@phosphor-icons/react";
import { Button } from "@/components/atoms/Button";
import GlideMenu from "@/components/atoms/GlideMenu";
import { RollingNumber } from "@/components/craft/RollingNumber";
import { playSfx } from "@/lib/sfx";
import { PAGE_LABELS, SITE_LABELS, SITE_NOUNS } from "@/lib/reviewer/score";
import { PAGE_TYPES, SITE_TYPES, type ClassifyEvent, type PageType, type SiteType } from "@/lib/reviewer/types";

/* ─────────────────────────────────────────────────────────
 * CLASSIFY CARD — Approval Card, asking what kind of page
 * this is. One question at a time; the card's height follows
 * the question, single choices auto-advance, and every pick
 * re-scores on the spot (no refetch: scoring is client-side).
 * ───────────────────────────────────────────────────────── */

const ADVANCE_MS = 480;
const SLIDE = { duration: 0.36, ease: [0.22, 1, 0.36, 1] as const };

const an = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

export function ClassifyCard({
  classify,
  site,
  page,
  onSite,
  onPage,
}: {
  classify: ClassifyEvent;
  site: SiteType;
  page: PageType;
  onSite: (s: SiteType) => void;
  onPage: (p: PageType) => void;
}) {
  const [qi, setQi] = useState(0);
  const [sent, setSent] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const detected = SITE_NOUNS[classify.detected];
  const sure = Math.round(classify.confidence * 100);
  const pageSure = Math.round(classify.pageConfidence * 100);
  const questions = [
    {
      q: classify.pinned
        ? `You asked for ${SITE_NOUNS[classify.siteType]}. It reads as ${an(detected)} ${detected} page (${sure}% sure). Score it as…`
        : `Looks like ${an(detected)} ${detected} page (${sure}% sure). Score it as…`,
      options: SITE_TYPES.map((t) => ({ key: t, label: SITE_LABELS[t] })),
      value: site as string,
      pick: (k: string) => onSite(k as SiteType),
    },
    {
      q: `Reads as ${an(PAGE_LABELS[classify.pageType])} ${PAGE_LABELS[classify.pageType].toLowerCase()} (${pageSure}% sure${classify.pageReason ? `, from its ${classify.pageReason}` : ""}). Weight it as…`,
      options: PAGE_TYPES.map((t) => ({ key: t, label: PAGE_LABELS[t] })),
      value: page as string,
      pick: (k: string) => onPage(k as PageType),
    },
  ];
  const last = qi === questions.length - 1;
  const current = questions[qi];

  const goTo = (i: number) => {
    if (timer.current) clearTimeout(timer.current);
    setQi(Math.max(0, Math.min(questions.length - 1, i)));
  };
  const finish = () => {
    if (timer.current) clearTimeout(timer.current);
    setSent(true);
    playSfx("success", 0.6);
  };
  const choose = (key: string) => {
    current.pick(key);
    playSfx("tap");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => (last ? finish() : setQi((q) => q + 1)), ADVANCE_MS);
  };

  if (sent) {
    return (
      <div className="flex w-full items-center gap-3" style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-green-tint py-1 pr-2.5 pl-1 text-[12.5px] font-medium text-green">
          <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-green text-white">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <span className="truncate">
            Scoring as {SITE_LABELS[site]}, {PAGE_LABELS[page].toLowerCase()}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            setQi(0);
            setSent(false);
          }}
          className="shrink-0 text-[12px] font-medium text-ink-3 transition-colors duration-150 hover:text-ink"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card" style={{ animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <div className="relative">
        <button
          type="button"
          aria-label="Keep these types"
          onClick={finish}
          className="primitive-icon-button absolute top-2.5 right-2.5 z-10 text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
        >
          <X size={14} weight="bold" />
        </button>
        <motion.div layout transition={SLIDE} className="primitive-card-pad overflow-hidden" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={qi}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14, transition: { duration: 0.18 } }}
              transition={SLIDE}
            >
              <div className="pr-8 text-[14px] leading-snug font-medium text-pretty text-ink">{current.q}</div>
              <GlideMenu className="mt-2.5 flex flex-col gap-1" highlightClassName="inset-x-0 rounded-control bg-hover">
                {current.options.map((o) => {
                  const on = o.key === current.value;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      data-menu-row
                      role="radio"
                      aria-checked={on}
                      onClick={() => choose(o.key)}
                      className="relative z-10 flex items-center gap-1.5 rounded-control py-1 pr-2 pl-1 text-left transition-colors duration-100"
                    >
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
                          on ? "bg-ink text-canvas" : "text-transparent shadow-[inset_0_0_0_1.5px_var(--line-strong)]"
                        }`}
                      >
                        <span className="size-1.5 rounded-full bg-canvas transition-transform duration-200" style={{ transform: on ? "scale(1)" : "scale(0)" }} />
                      </span>
                      <span className={`text-[13px] leading-none transition-colors duration-200 ${on ? "text-ink" : "text-ink-2"}`}>{o.label}</span>
                      {o.key === (qi === 0 ? classify.detected : classify.pageType) && (
                        <span className="ml-auto text-[11px] text-ink-3">detected</span>
                      )}
                    </button>
                  );
                })}
              </GlideMenu>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      <div className="primitive-card-footer flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-ink-3">
          <button
            type="button"
            aria-label="Previous question"
            disabled={qi === 0}
            onClick={() => goTo(qi - 1)}
            className="flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 enabled:hover:text-ink disabled:opacity-30"
          >
            <CaretUp size={13} weight="bold" />
          </button>
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3">
            <RollingNumber value={qi + 1} duration={350} /> / {questions.length}
          </span>
          <button
            type="button"
            aria-label="Next question"
            disabled={last}
            onClick={() => goTo(qi + 1)}
            className="flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 enabled:hover:text-ink disabled:opacity-30"
          >
            <CaretDown size={13} weight="bold" />
          </button>
        </div>
        <div className="-mr-0.5 flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => (last ? finish() : goTo(qi + 1))}>
            Skip
          </Button>
          <Button variant="accent" size="sm" onClick={() => (last ? finish() : goTo(qi + 1))}>
            {last ? "Done" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
