"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowsIn, ArrowsOut, Scan } from "@phosphor-icons/react";
import { Button } from "@/components/atoms/Button";
import { ScrollFade } from "@/components/craft/ScrollFade";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import type { Box, BoxKind, CaptureEvent, PageFacts } from "@/lib/reviewer/types";
import type { Phase } from "./useAudit";
import { BOX_STYLE, hostOf, useIsClient } from "./ui";
import styles from "./reviewer.module.css";

/* ─────────────────────────────────────────────────────────
 * CAPTURE SCREEN — Agent Screen, pointed at the audited page.
 *
 *   capturing   a beam sweeps the frame
 *   captured    the first screen (1440×900) as the visitor saw it;
 *               detected elements flash in, staggered, then hide
 *   hover       the X-ray lens: a 140px circle that shows the
 *               element boxes and labels inside it only
 *   X-ray on    every box at once (touch: tap the frame)
 *   Open        the whole capture, below the fold included
 * Boxes under the fold become chips on the frame's bottom edge.
 * ───────────────────────────────────────────────────────── */

const LENS = 70; // radius in px

type Focus = { kind: BoxKind; n: number } | null;

export type ViewerState = { open: boolean; target: { y: number; kind: BoxKind; n: number } | null };

function labelFor(b: Box) {
  return b.kind === "cta" && b.primary ? "Primary CTA" : BOX_STYLE[b.kind].label;
}

/** One label per cluster: stacked trust lines don't need five "Trust" tags. */
function labeled(boxes: Box[]): boolean[] {
  const seen: Box[] = [];
  return boxes.map((b) => {
    const near = seen.some((o) => o.kind === b.kind && Math.abs(o.y - b.y) < 44 && Math.abs(o.x - b.x) < 240);
    seen.push(b);
    return !near;
  });
}

/**
 * Where a box's label goes, so neighbors don't stack labels on each other:
 * big boxes carry it inside, boxes on the right half hang it in the gutter
 * to their left, the rest sit it on top.
 */
function placement(b: Box, width: number, lens: boolean): "inside" | "left" | "above" {
  if (b.h >= 50 || b.y < 26) return "inside";
  // the lens only shows a circle around the pointer: keep labels on the box's edge, not out in the gutter
  if (!lens && b.x + b.w / 2 > width * 0.55 && b.x > 90) return "left";
  return "above";
}

function BoxLayer({
  boxes,
  width,
  height,
  stagger,
  labels = true,
  lens = false,
  className,
}: {
  boxes: Box[];
  width: number;
  height: number;
  stagger?: boolean;
  labels?: boolean;
  /** drawn inside the X-ray lens */
  lens?: boolean;
  className?: string;
}) {
  const show = labeled(boxes);
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)} aria-hidden>
      {boxes.map((b, i) => {
        const s = BOX_STYLE[b.kind];
        const where = placement(b, width, lens);
        return (
          <div
            key={`${b.kind}-${b.x}-${b.y}-${i}`}
            className={cn("absolute rounded-[4px]", stagger && styles.boxIn)}
            style={
              {
                left: `${(b.x / width) * 100}%`,
                top: `${(b.y / height) * 100}%`,
                width: `${(b.w / width) * 100}%`,
                height: `${(b.h / height) * 100}%`,
                boxShadow: `inset 0 0 0 1.5px ${s.color}`,
                background: `color-mix(in oklch, ${s.color} 16%, transparent)`,
                "--i": i,
              } as CSSProperties
            }
          >
            {labels && show[i] && (
              <span
                className={cn(
                  "absolute rounded-[4px] px-[clamp(3px,0.9cqw,6px)] py-[clamp(2px,0.4cqw,3px)] text-[clamp(8px,1.45cqw,10px)] leading-none font-semibold whitespace-nowrap text-white",
                  where === "inside" && "top-[3px] left-[3px]",
                  where === "left" && "top-0 right-[calc(100%+4px)]",
                  where === "above" && "top-0 left-0 -translate-y-[calc(100%+3px)]",
                )}
                style={{ background: s.color }}
              >
                {labelFor(b)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** the page without a screenshot: a wireframe built from what the HTML said */
function Schematic({ page, phase, url, note }: { page: PageFacts | null; phase: Phase; url: string; note?: string }) {
  const host = url ? hostOf(url) : "your-store.com/products/…";
  const muted = !page;
  return (
    <div className={cn("absolute inset-0 flex flex-col bg-surface", phase === "idle" && "opacity-70")}>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line bg-inset px-3 py-2">
        <span className="flex items-center gap-1" aria-hidden>
          <span className="size-2 rounded-full bg-red/70" />
          <span className="size-2 rounded-full bg-orange/70" />
          <span className="size-2 rounded-full bg-green/70" />
        </span>
        <span className="ml-2 min-w-0 flex-1 truncate rounded-full bg-field px-2.5 py-[3px] font-mono text-[10px] text-ink-3">{host}</span>
      </div>
      <div className="grid flex-1 grid-cols-[1.15fr_1fr] gap-[4%] p-[5%]">
        <div className="relative rounded-[10px] bg-inset shadow-hairline">
          {page && (
            <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11px] text-ink-3">
              {page.imageCount > 0 ? `${page.imageCount} images in the HTML` : "No images found"}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-[6%] pt-[2%]">
          <span className="h-2 w-1/3 rounded-full bg-line-strong" />
          {page?.h1 ? (
            <span className="line-clamp-2 text-[clamp(11px,1.6vw,17px)] leading-tight font-semibold text-ink">{page.h1}</span>
          ) : (
            <span className={cn("h-4 w-4/5 rounded-full", muted ? "bg-line-strong" : "border border-dashed border-red bg-red-tint")} />
          )}
          {page ? (
            page.price ? (
              <span className="num text-[clamp(11px,1.4vw,15px)] font-semibold text-ink">{page.price}</span>
            ) : (
              <span className="w-fit rounded-[6px] border border-dashed border-red px-2 py-1 text-[10.5px] text-red">No price found</span>
            )
          ) : (
            <span className="h-3 w-1/4 rounded-full bg-line-strong" />
          )}
          <span className="flex flex-col gap-1.5">
            <span className="h-1.5 w-full rounded-full bg-line" />
            <span className="h-1.5 w-11/12 rounded-full bg-line" />
            <span className="h-1.5 w-3/5 rounded-full bg-line" />
          </span>
          {page ? (
            page.cta ? (
              <span className="w-fit max-w-full truncate rounded-[8px] bg-accent px-3 py-1.5 text-[11px] font-medium text-accent-fg">{page.cta}</span>
            ) : (
              <span className="w-fit rounded-[8px] border border-dashed border-red px-3 py-1.5 text-[10.5px] text-red">No button found</span>
            )
          ) : (
            <span className="h-6 w-2/5 rounded-[8px] bg-accent-tint" />
          )}
        </div>
      </div>
      {note && (
        <span className="absolute right-3 bottom-3 left-3 rounded-[8px] bg-inset px-2.5 py-1.5 text-[11px] leading-snug text-ink-2 shadow-hairline">
          {note}
        </span>
      )}
    </div>
  );
}

function ViewerToggle({ on, onChange, compact }: { on: boolean; onChange: (v: boolean) => void; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="X-ray: show every element box"
      onClick={() => {
        onChange(!on);
        playSfx("toggle");
      }}
      className={cn(
        "press inline-flex h-7 items-center gap-1.5 rounded-control pr-2 pl-1.5 text-[12.5px] font-medium transition-colors duration-100",
        on ? "bg-accent-tint text-accent-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
      )}
    >
      <Scan size={15} weight="bold" />
      X-ray
      {!compact && (
        <span
          aria-hidden
          className={cn("relative ml-0.5 h-3.5 w-6 rounded-full transition-colors duration-200", on ? "bg-accent" : "bg-line-strong")}
        >
          <span
            className="absolute top-0.5 left-0.5 size-2.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)] transition-transform duration-200 ease-out-strong"
            style={{ transform: on ? "translateX(10px)" : "none" }}
          />
        </span>
      )}
    </button>
  );
}

export function CaptureScreen({
  phase,
  url,
  capture,
  boxes,
  page,
  scanning,
  runId,
  xray,
  onXray,
  focus,
  viewer,
  onViewer,
}: {
  phase: Phase;
  url: string;
  capture: CaptureEvent | null;
  boxes: Box[];
  page: PageFacts | null;
  scanning: boolean;
  runId: number;
  xray: boolean;
  onXray: (v: boolean) => void;
  focus: Focus;
  /** the expanded viewer, owned by the parent so "Show on capture" can open it */
  viewer: ViewerState;
  onViewer: (v: ViewerState) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<string>("mouse");
  const [lens, setLens] = useState(false);
  const [viewerXray, setViewerXray] = useState(true);
  const client = useIsClient();
  const open = viewer.open;

  const src = capture?.src ?? null;
  const W = capture?.width ?? 1440;
  const fold = capture?.viewportHeight ?? 900;
  const inFrame = boxes.filter((b) => b.y < fold);
  const below = boxes.filter((b) => b.y >= fold);
  const focusBoxes = focus ? inFrame.filter((b) => b.kind === focus.kind) : [];

  // one chip per kind for what sits under the fold, nearest first
  const belowChips = Object.values(
    below.reduce<Record<string, Box>>((acc, b) => {
      const key = b.kind === "cta" && b.primary ? "primary" : b.kind;
      if (!acc[key] || b.y < acc[key].y) acc[key] = b;
      return acc;
    }, {}),
  )
    .sort((a, b) => Number(!!b.primary) - Number(!!a.primary) || a.y - b.y)
    .slice(0, 4);

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = frameRef.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--lx", `${e.clientX - r.left}px`);
    el.style.setProperty("--ly", `${e.clientY - r.top}px`);
  };

  const openViewer = () => {
    if (!src) return;
    onViewer({ open: true, target: null });
    playSfx("open");
  };
  const closeViewer = () => {
    onViewer({ open: false, target: null });
    playSfx("close");
  };

  // Esc closes, and the page behind the viewer stops scrolling
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onViewer({ open: false, target: null });
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onViewer]);

  const title = capture?.title || page?.title || (url ? hostOf(url) : "No page yet");
  const engine =
    capture?.engine === "playwright"
      ? `Chromium, ${(capture.elapsedMs / 1000).toFixed(1)}s`
      : capture?.engine === "sample"
        ? "Local sample"
        : capture?.engine === "fetch"
          ? "HTML only"
          : phase === "running"
            ? "Capturing"
            : "";
  const hasBoxes = !!src && boxes.length > 0;
  const lensOn = lens && hasBoxes && !xray;

  const total = capture?.srcBelow ? capture.height : fold;
  const target = viewer.target;

  // "Show on capture" for something under the fold: scroll the viewer to it
  useEffect(() => {
    if (!open || !target) return;
    const id = requestAnimationFrame(() => {
      const el = contentRef.current;
      const sc = el?.parentElement;
      if (!el || !sc) return;
      const contentH = (el.offsetWidth * total) / W;
      sc.scrollTo({ top: Math.max(0, (target.y / total) * contentH - sc.clientHeight / 3), behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [open, target, total, W]);

  return (
    <div className="w-full">
      <div
        ref={frameRef}
        role={src ? "button" : undefined}
        tabIndex={src ? 0 : undefined}
        aria-label={src ? `Open the capture of ${title}` : undefined}
        onKeyDown={(e) => {
          if (src && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            openViewer();
          }
        }}
        onPointerEnter={(e) => e.pointerType === "mouse" && setLens(true)}
        onPointerLeave={() => setLens(false)}
        onPointerMove={move}
        onPointerDown={(e) => {
          pointerRef.current = e.pointerType;
        }}
        onClick={() => {
          if (!src) return;
          // touch: tap toggles X-ray; mouse: click opens the viewer
          if (pointerRef.current === "touch" || pointerRef.current === "pen") {
            if (hasBoxes) onXray(!xray);
          } else openViewer();
        }}
        className={cn(
          "group/screen @container relative aspect-[1440/900] w-full overflow-hidden rounded-window bg-inset shadow-card select-none",
          src && "cursor-zoom-in",
        )}
        style={{ "--lx": "-200px", "--ly": "-200px" } as CSSProperties}
      >
        {src ? (

          <img
            key={runId}
            src={src}
            alt={`First screen of ${title}`}
            draggable={false}
            className="image-outline absolute inset-0 h-full w-full object-cover object-top"
            style={{ animation: "fade-in 420ms cubic-bezier(0.23,1,0.32,1) both" }}
          />
        ) : (
          <Schematic page={page} phase={phase} url={url} note={capture?.note} />
        )}

        {hasBoxes && (
          <>
            {/* the x-ray: a blueprint copy of the page plus the boxes, clipped to the lens */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ clipPath: xray ? "none" : lensOn ? `circle(${LENS}px at var(--lx) var(--ly))` : "circle(0px at -200px -200px)" }}
              aria-hidden
            >
              <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover object-top grayscale brightness-[0.62] contrast-[1.08]" />
              <div
                className="absolute inset-0 opacity-50"
                style={{
                  backgroundImage:
                    "linear-gradient(color-mix(in oklch, var(--accent) 30%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklch, var(--accent) 30%, transparent) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />
              <BoxLayer boxes={inFrame} width={W} height={fold} lens={!xray} />
            </div>

            {/* first reveal: every box, staggered, then gone */}
            {!xray && <BoxLayer key={`flash-${runId}-${boxes.length}`} boxes={inFrame} width={W} height={fold} stagger labels={false} className={styles.flash} />}
            {/* "show on capture" from the table */}
            {focus && focusBoxes.length > 0 && !xray && (
              <BoxLayer key={`focus-${focus.n}`} boxes={focusBoxes} width={W} height={fold} stagger className={styles.flash} />
            )}

            {/* lens ring */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 rounded-full"
              style={{
                width: LENS * 2,
                height: LENS * 2,
                transform: `translate(calc(var(--lx) - ${LENS}px), calc(var(--ly) - ${LENS}px))`,
                boxShadow: "0 0 0 1.5px rgba(255,255,255,0.85), 0 0 0 3px rgba(17,19,24,0.18), 0 10px 30px rgba(17,19,24,0.3)",
                opacity: lensOn ? 1 : 0,
              }}
            />
          </>
        )}

        {scanning && <div className={styles.beam} aria-hidden />}

        {src && belowChips.length > 0 && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap gap-1">
            {belowChips.map((b) => (
              <span
                key={`${b.kind}-${b.y}`}
                className="num inline-flex h-[clamp(18px,3.4cqw,24px)] items-center gap-1 rounded-full px-[clamp(6px,1.2cqw,8px)] text-[clamp(9.5px,1.55cqw,11px)] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,.25)]"
                style={{ background: BOX_STYLE[b.kind].color, animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) 900ms both" }}
              >
                {labelFor(b)}
                <ArrowDown size={10} weight="bold" />
                {Math.round(b.y).toLocaleString("en-US")}px
              </span>
            ))}
          </div>
        )}

        {src && (
          <span className="pointer-events-none absolute top-2 right-2 opacity-0 transition-opacity duration-150 group-hover/screen:opacity-100 [@media(hover:none)]:opacity-100">
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[rgba(17,19,24,0.72)] px-2 text-[11px] font-medium text-white backdrop-blur-sm">
              <ArrowsOut size={12} weight="bold" />
              Open
            </span>
          </span>
        )}
      </div>

      <div className="mt-2.5 flex min-h-7 items-center gap-2 px-0.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-field text-[10px] font-semibold text-ink-2 uppercase" aria-hidden>
          {(hostOf(url || "a").replace("sample:", "") || "a").charAt(0)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {title}
          {engine && <span className="ml-2 font-normal text-ink-3">{engine}</span>}
        </span>
        {hasBoxes && <ViewerToggle on={xray} onChange={onXray} />}
        {src && (
          <Button variant="ghost" size="sm" className="gap-1 pl-1.5" onClick={openViewer} aria-label="Open the full capture">
            <ArrowsOut size={14} weight="bold" />
            <span className="hidden sm:inline">Open</span>
          </Button>
        )}
      </div>
      {hasBoxes && (
        <p className="mt-1 px-0.5 text-[11.5px] text-ink-3">
          <span className="[@media(hover:none)]:hidden">Hover the capture to x-ray it. Click to see the whole page.</span>
          <span className="hidden [@media(hover:none)]:inline">Tap the capture to x-ray it.</span>
        </p>
      )}

      {open &&
        client &&
        src &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Capture of ${title}`}>
            <div className="absolute inset-0 bg-black/60 dark:bg-black/75" style={{ animation: "fade-in 180ms ease-out both" }} onClick={closeViewer} />
            <div
              className="relative flex max-h-full w-[min(1100px,94vw)] flex-col overflow-hidden rounded-[16px] bg-surface p-2 pt-0 shadow-overlay"
              style={{ animation: "pop-in 240ms cubic-bezier(0.23,1,0.32,1) both" }}
            >
              <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-1.5">
                <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
                  {title}
                  <span className="num ml-2 font-normal text-ink-3">
                    {W}×{total}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {hasBoxes && <ViewerToggle on={viewerXray} onChange={setViewerXray} compact />}
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={closeViewer}
                    className="primitive-icon-button text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
                  >
                    <ArrowsIn size={15} weight="bold" />
                  </button>
                </span>
              </div>
              <ScrollFade className="relative min-h-0 rounded-[8px] bg-inset" style={{ maxHeight: "calc(100dvh - 120px)" }}>
                <div ref={contentRef} className="@container relative">
                  <img src={src} alt={`First screen of ${title}`} className="block h-auto w-full" draggable={false} />
                  {capture?.srcBelow && (

                    <img src={capture.srcBelow} alt={`Below the fold of ${title}`} className="block h-auto w-full" draggable={false} />
                  )}
                  {capture?.srcBelow && (
                    <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-accent" style={{ top: `${(fold / total) * 100}%` }}>
                      <span className="num absolute top-1 right-2 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold text-accent-fg">
                        Fold, {fold}px
                      </span>
                    </div>
                  )}
                  {hasBoxes && viewerXray && (
                    <BoxLayer boxes={capture?.srcBelow ? boxes : inFrame} width={W} height={total} stagger />
                  )}
                  {target && (
                    <BoxLayer
                      key={`target-${target.n}`}
                      boxes={boxes.filter((b) => b.kind === target.kind && (capture?.srcBelow || b.y < fold))}
                      width={W}
                      height={total}
                      stagger
                      className={styles.flash}
                    />
                  )}
                </div>
              </ScrollFade>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
