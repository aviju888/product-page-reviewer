"use client";

import { useMemo, useRef, useState } from "react";
import { LayoutGroup, motion, MotionConfig } from "motion/react";
import { WarningCircle } from "@phosphor-icons/react";
import { playSfx } from "@/lib/sfx";
import { loadHistory, recordRun, type HistoryEntry } from "@/lib/reviewer/history";
import { defaultWeights, scoreSignals, signalImpact, type WeightOverrides } from "@/lib/reviewer/score";
import { summarize } from "@/lib/reviewer/summary";
import {
  CATEGORY_IDS,
  type BoxKind,
  type CategoryId,
  type PageType,
  type Recommendation,
  type SampleId,
  type SiteType,
} from "@/lib/reviewer/types";
import { AuditTasks } from "./AuditTasks";
import { CaptureScreen, type ViewerState } from "./CaptureScreen";
import { CategoryInsights } from "./CategoryInsights";
import { ClassifyCard } from "./ClassifyCard";
import { CompetitorDuel } from "./CompetitorDuel";
import { FixCard } from "./FixCard";
import { ScorePanel } from "./ScorePanel";
import { SignalTable } from "./SignalTable";
import { UrlBar } from "./UrlBar";
import { useAudit } from "./useAudit";
import { WeightsCard } from "./WeightsCard";
import { SectionLabel } from "./ui";

/* ─────────────────────────────────────────────────────────
 * REVIEWER — paste a URL, watch the audit happen.
 * The server streams capture → classify → checks → score →
 * fixes. Everything after that (site type, page type, weights,
 * the duel) re-scores in the browser from the same signals.
 * ───────────────────────────────────────────────────────── */

const EASE = [0.23, 1, 0.32, 1] as const;

function ErrorNote({ message, onSample }: { message: string; onSample: (id: SampleId) => void }) {
  return (
    <div
      role="alert"
      className="mt-3 flex w-full items-start gap-2.5 rounded-card bg-red-tint px-3.5 py-3 text-left text-[13px] text-red"
      style={{ animation: "fade-up 320ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      <WarningCircle size={16} weight="bold" className="mt-px shrink-0" />
      <span className="min-w-0 flex-1 text-pretty">
        {message}
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {(["strong", "weak"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onSample(id)}
              className="press rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 shadow-btn hover:text-ink"
            >
              Use the {id} sample
            </button>
          ))}
        </span>
      </span>
    </div>
  );
}

export function ReviewerApp() {
  const [draft, setDraft] = useState("");
  const [siteReq, setSiteReq] = useState<"auto" | SiteType>("auto");
  const [siteChoice, setSiteChoice] = useState<SiteType | null>(null);
  const [pageChoice, setPageChoice] = useState<PageType | null>(null);
  const [overrides, setOverrides] = useState<WeightOverrides>({});
  const [xray, setXray] = useState(false);
  const [focus, setFocus] = useState<{ kind: BoxKind; n: number } | null>(null);
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [viewer, setViewer] = useState<ViewerState>({ open: false, target: null });
  const captureRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const main = useAudit({
    onDone: (s) => {
      if (s.scores && s.classify) {
        setHistory(recordRun(s.url, { t: Date.now(), score: s.scores.overall, site: s.classify.siteType, page: s.classify.pageType }));
      }
      playSfx("success", 0.7);
    },
    onError: () => playSfx("error"),
  });
  const duel = useAudit({ onDone: () => playSfx("success", 0.5) });
  const st = main.state;

  const start = (url: string) => {
    setSiteChoice(null);
    setPageChoice(null);
    setFocus(null);
    setCategory("all");
    setXray(false);
    setViewer({ open: false, target: null });
    setHistory(loadHistory(url));
    duel.cancel();
    main.run(url, siteReq);
  };
  const runSample = (id: SampleId) => {
    setDraft(`sample:${id}`);
    start(`sample:${id}`);
  };

  const site: SiteType = siteChoice ?? st.classify?.siteType ?? (siteReq === "auto" ? "ecommerce" : siteReq);
  const page: PageType = pageChoice ?? st.classify?.pageType ?? "product";

  const score = useMemo(() => (st.signals.length ? scoreSignals(st.signals, site, page, overrides) : null), [st.signals, site, page, overrides]);
  const impact = useMemo(() => signalImpact(st.signals, site, page, overrides), [st.signals, site, page, overrides]);

  // fixes re-rank by what they're worth under the current types and weights
  const recs = useMemo(() => {
    if (!st.recs) return null;
    const items: Recommendation[] = st.recs.items
      .map((r) => {
        const points = Math.round(r.signalIds.reduce((a, id) => a + (impact[id]?.lost ?? 0), 0) * 10) / 10;
        const impactLevel = st.recs!.source === "rules" ? (points >= 4 ? "high" : points >= 1.5 ? "medium" : "low") : r.impact;
        return { ...r, points, impact: impactLevel };
      })
      .filter((r) => (r.points ?? 0) > 0.05 || st.recs!.source === "llm")
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    return { ...st.recs, items };
  }, [st.recs, impact]);

  const summary = useMemo(() => {
    if (!recs || !score) return null;
    if (recs.source === "llm") return recs.summary;
    return summarize({ score, site, page }, recs.items[0]);
  }, [recs, score, site, page]);

  const checksMeta = st.tasks.checks.meta?.match(/(\d+)\/(\d+)/);
  const total = checksMeta ? Number(checksMeta[2]) : st.tasks.checks.status === "done" ? st.signals.length : 0;
  const dialState = st.scores && score ? "scored" : st.phase === "running" ? "measuring" : "idle";
  const scanning = st.phase === "running" && (["capture", "classify", "checks"] as const).some((id) => st.tasks[id].status === "running");
  const base = defaultWeights(site, page);
  const edited = CATEGORY_IDS.some((id) => overrides[id] !== undefined && overrides[id] !== base[id]);
  const showWorkspace = st.phase !== "idle" && !(st.phase === "error" && !st.capture && !st.classify);

  const locate = (kind: BoxKind) => {
    const fold = st.capture?.viewportHeight ?? 900;
    const targets = st.boxes.filter((b) => b.kind === kind);
    const target = targets.find((b) => b.primary) ?? targets[0];
    const n = (focus?.n ?? 0) + 1;
    setXray(false);
    if (target && target.y >= fold && st.capture?.srcBelow) {
      // under the fold: open the whole capture, scrolled to it
      setViewer({ open: true, target: { y: target.y, kind, n } });
      playSfx("open");
      return;
    }
    captureRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFocus({ kind, n });
  };
  const showCategory = (c: CategoryId) => {
    setCategory(c);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const bar = (compact: boolean) => (
    <UrlBar
      value={draft}
      onChange={setDraft}
      siteType={siteReq}
      onSiteType={setSiteReq}
      running={st.phase === "running"}
      onSubmit={start}
      onStop={main.cancel}
      onSample={runSample}
      autoFocus={!compact}
      compact={compact}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="mx-auto w-full max-w-[1240px] px-4 pb-28 sm:px-6">
          {!showWorkspace ? (
            <section className="mx-auto flex min-h-[calc(100dvh-180px)] max-w-[680px] flex-col items-center justify-center pt-8 text-center">
              <h1 className="text-[34px] leading-[1.1] font-semibold tracking-[-0.035em] text-balance text-ink sm:text-[48px]">
                Product Page Reviewer
              </h1>
              <p className="mt-3 max-w-[520px] text-[14px] leading-relaxed text-pretty text-ink-2">
                Find ways to improve your product page.
              </p>
              <motion.div layoutId="urlbar" transition={{ duration: 0.45, ease: EASE }} className="mt-7 w-full text-left">
                {bar(false)}
              </motion.div>
              {st.phase === "error" && st.error && <ErrorNote message={st.error} onSample={runSample} />}
            </section>
          ) : (
            <>
              <h1 className="sr-only">Audit of {st.capture?.title || st.url}</h1>
              <motion.div layoutId="urlbar" transition={{ duration: 0.45, ease: EASE }} className="mx-auto max-w-[760px] pt-5 lg:mx-0">
                {bar(true)}
              </motion.div>
              {st.phase === "error" && st.error && (
                <div className="max-w-[760px]">
                  <ErrorNote message={st.error} onSample={runSample} />
                </div>
              )}

              <div className="mt-6 grid items-start gap-5 lg:grid-cols-12">
                <div ref={captureRef} className="flex min-w-0 scroll-mt-20 flex-col gap-4 lg:col-span-7">
                  <CaptureScreen
                    phase={st.phase}
                    url={st.url}
                    capture={st.capture}
                    boxes={st.boxes}
                    page={st.page}
                    scanning={scanning}
                    runId={st.runId}
                    xray={xray}
                    onXray={setXray}
                    focus={focus}
                    viewer={viewer}
                    onViewer={setViewer}
                  />
                  <AuditTasks tasks={st.tasks} signals={st.signals} />
                </div>
                <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
                  <ScorePanel
                    runId={st.runId}
                    state={dialState}
                    score={score}
                    site={site}
                    page={page}
                    summary={summary}
                    summaryPending={st.tasks.report.status === "running"}
                    legacy={st.scores?.legacy ?? null}
                    checked={st.signals.length}
                    total={total}
                    history={history}
                    edited={edited}
                    classified={!!st.classify}
                  />
                  {st.classify && (
                    <ClassifyCard
                      key={`classify-${st.runId}`}
                      classify={st.classify}
                      site={site}
                      page={page}
                      onSite={setSiteChoice}
                      onPage={setPageChoice}
                    />
                  )}
                  {(st.classify || st.phase === "running") && (
                    <FixCard key={`fixes-${st.runId}`} url={st.url} recs={recs} pending={st.tasks.report.status === "running"} />
                  )}
                </div>
              </div>

              <div className="mt-12 grid items-start gap-x-5 gap-y-10 lg:grid-cols-12">
                <div className="min-w-0 lg:col-span-5">
                  {score ? (
                    <CategoryInsights categories={score.categories} signals={st.signals} impact={impact} site={site} page={page} onShow={showCategory} />
                  ) : (
                    <>
                      <SectionLabel>Categories</SectionLabel>
                      <div className="h-[420px] rounded-card bg-surface/60 shadow-hairline" />
                    </>
                  )}
                </div>
                <div ref={tableRef} className="min-w-0 scroll-mt-20 lg:col-span-7">
                  <SectionLabel count={st.signals.length}>Checks</SectionLabel>
                  <SignalTable
                    signals={st.signals}
                    site={site}
                    page={page}
                    impact={impact}
                    category={category}
                    onCategory={setCategory}
                    onLocate={st.capture?.src ? locate : undefined}
                    streaming={st.phase === "running"}
                  />
                </div>
              </div>

              <div className="mt-12 grid items-start gap-x-5 gap-y-10 lg:grid-cols-12">
                <div className="min-w-0 lg:col-span-4">
                  <SectionLabel>Tune the score</SectionLabel>
                  <WeightsCard
                    site={site}
                    page={page}
                    overrides={overrides}
                    onSite={setSiteChoice}
                    onPage={setPageChoice}
                    onWeight={(c, v) => setOverrides((o) => ({ ...o, [c]: v }))}
                    onReset={() => setOverrides({})}
                    disabled={!score}
                  />
                </div>
                <div className="min-w-0 lg:col-span-8">
                  <SectionLabel>Competitor duel</SectionLabel>
                  <CompetitorDuel
                    main={st}
                    duel={duel.state}
                    site={site}
                    page={page}
                    overrides={overrides}
                    onRun={(url) => duel.run(url, siteReq)}
                    onClear={duel.cancel}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
