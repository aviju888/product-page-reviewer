"use client";

import { useState, type ReactNode } from "react";
import type { Signal, TaskDetail, TaskEvent, TaskId } from "@/lib/reviewer/types";
import { TASK_ORDER } from "./useAudit";

/* ─────────────────────────────────────────────────────────
 * AUDIT TASKS — Task Rows (List variant), driven by the SSE
 * task events instead of a demo timer. The checks row opens
 * while it runs and counts pass / warn / fail live, then
 * folds away, the same grammar as the original's row 1.
 * ───────────────────────────────────────────────────────── */

function SpinnerRing({ active, children }: { active?: boolean; children?: ReactNode }) {
  const size = 24;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" style={active ? { animation: "spin 1.1s linear infinite" } : undefined} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {active && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        )}
      </svg>
      <span className="num relative text-[10.5px] font-semibold text-ink">{children}</span>
    </span>
  );
}

function Badge({ tone, children }: { tone: "red" | "green"; children: ReactNode }) {
  return (
    <span
      className={`flex size-5.5 shrink-0 items-center justify-center rounded-full text-white ${tone === "red" ? "bg-red" : "bg-green"}`}
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {children}
    </span>
  );
}

const XIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" aria-hidden>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const CheckIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export function AuditTasks({ tasks, signals }: { tasks: Record<TaskId, TaskEvent>; signals: Signal[] }) {
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});

  const live: TaskDetail[] = [
    { label: "Passed", meta: String(signals.filter((s) => s.status === "pass").length) },
    { label: "Warnings", meta: String(signals.filter((s) => s.status === "warn").length) },
    { label: "Failed", meta: String(signals.filter((s) => s.status === "fail").length) },
  ];

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-card bg-surface shadow-card">
      {TASK_ORDER.map((id, i) => {
        const row = tasks[id];
        const details = id === "checks" && signals.length > 0 ? live : (row.details ?? []);
        const auto = id === "checks" && row.status === "running" && signals.length > 0;
        const open = (manualOpen[id] ?? auto) && details.length > 0;
        const step = i + 1;
        return (
          <div
            key={id}
            className="self-stretch overflow-hidden border-b border-line transition-colors duration-150 last:border-0 hover:bg-inset"
            style={{ animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${i * 60}ms both` }}
          >
            <button
              type="button"
              aria-expanded={open}
              disabled={details.length === 0}
              onClick={() => setManualOpen((m) => ({ ...m, [id]: !open }))}
              className="flex h-11 w-full items-center gap-2.5 px-2.5 text-left disabled:cursor-default"
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                {row.status === "done" ? (
                  <Badge tone="green">{CheckIcon}</Badge>
                ) : row.status === "failed" ? (
                  <Badge tone="red">{XIcon}</Badge>
                ) : (
                  <SpinnerRing active={row.status === "running"}>{step}</SpinnerRing>
                )}
              </span>
              <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${row.status === "queued" ? "text-ink-3" : "text-ink"}`}>{row.label}</span>
              {row.meta && <span className="num shrink-0 text-[12.5px] text-ink-2">{row.meta}</span>}
              {row.status === "failed" && (
                <span className="inline-flex h-5.5 shrink-0 items-center rounded-full bg-red-tint px-2 text-[11.5px] font-medium text-red" style={{ animation: "fade-in 200ms ease-out both" }}>
                  Failed
                </span>
              )}
              <span aria-hidden className={`-ml-1 flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3 ${details.length === 0 ? "invisible" : ""}`}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-300"
                  style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>
            <div
              className="grid transition-[grid-template-rows,opacity] duration-300"
              style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
              inert={!open}
            >
              <div className="overflow-hidden">
                <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
                  <span aria-hidden className="mx-auto h-full w-px bg-line" />
                  <div className="flex flex-col gap-1.5">
                    {details.map((d, j) => (
                      <div
                        key={d.label}
                        className="flex items-center justify-between gap-3"
                        style={open ? { animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${80 + j * 60}ms both` } : undefined}
                      >
                        <span className="text-[12px] text-ink-2">{d.label}</span>
                        <span className="num font-mono text-[11.5px] text-ink-3">{d.meta}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
