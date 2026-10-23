"use client";

import { useCallback, useLayoutEffect, useReducer, useRef } from "react";
import { postSSE } from "@/lib/sse-client";
import type {
  Box,
  CaptureEvent,
  ClassifyEvent,
  PageFacts,
  RecommendationsEvent,
  ScoresEvent,
  Signal,
  SiteType,
  TaskEvent,
  TaskId,
} from "@/lib/reviewer/types";

/* ─────────────────────────────────────────────────────────
 * useAudit — one audit's live state, fed by the SSE route.
 * Pure reducer; the stream callback only dispatches.
 * ───────────────────────────────────────────────────────── */

export const TASK_ORDER: TaskId[] = ["capture", "classify", "checks", "score", "report"];

const TASK_LABELS: Record<TaskId, string> = {
  capture: "Capture the page",
  classify: "Classify the page",
  checks: "Run the checks",
  score: "Score it",
  report: "Write the fixes",
};

export type Phase = "idle" | "running" | "done" | "error";

export type AuditState = {
  phase: Phase;
  runId: number;
  url: string;
  siteType: "auto" | SiteType;
  tasks: Record<TaskId, TaskEvent>;
  capture: CaptureEvent | null;
  boxes: Box[];
  page: PageFacts | null;
  classify: ClassifyEvent | null;
  signals: Signal[];
  scores: ScoresEvent | null;
  recs: RecommendationsEvent | null;
  error: string | null;
};

type Action =
  | { type: "start"; url: string; siteType: "auto" | SiteType }
  | { type: "event"; runId: number; event: string; data: unknown }
  | { type: "fail"; runId: number; message: string }
  | { type: "reset" };

function queuedTasks(): Record<TaskId, TaskEvent> {
  return Object.fromEntries(TASK_ORDER.map((id) => [id, { id, label: TASK_LABELS[id], status: "queued" }])) as Record<TaskId, TaskEvent>;
}

export const INITIAL: AuditState = {
  phase: "idle",
  runId: 0,
  url: "",
  siteType: "auto",
  tasks: queuedTasks(),
  capture: null,
  boxes: [],
  page: null,
  classify: null,
  signals: [],
  scores: null,
  recs: null,
  error: null,
};

function reducer(state: AuditState, action: Action): AuditState {
  switch (action.type) {
    case "start":
      return { ...INITIAL, phase: "running", runId: state.runId + 1, url: action.url, siteType: action.siteType, tasks: queuedTasks() };
    case "reset":
      return { ...INITIAL, runId: state.runId + 1 };
    case "fail": {
      if (action.runId !== state.runId || state.phase !== "running") return state;
      const tasks = { ...state.tasks };
      for (const id of TASK_ORDER) if (tasks[id].status === "running") tasks[id] = { ...tasks[id], status: "failed" };
      return { ...state, phase: "error", error: action.message, tasks };
    }
    case "event": {
      if (action.runId !== state.runId) return state;
      const d = action.data;
      switch (action.event) {
        case "task": {
          const t = d as TaskEvent;
          return { ...state, tasks: { ...state.tasks, [t.id]: { ...state.tasks[t.id], ...t } } };
        }
        case "capture":
          return { ...state, capture: d as CaptureEvent };
        case "boxes":
          return { ...state, boxes: (d as { boxes: Box[] }).boxes ?? [] };
        case "page":
          return { ...state, page: d as PageFacts };
        case "classify":
          return { ...state, classify: d as ClassifyEvent };
        case "signal":
          return { ...state, signals: [...state.signals, (d as { signal: Signal }).signal] };
        case "scores":
          return { ...state, scores: d as ScoresEvent };
        case "recommendations":
          return { ...state, recs: d as RecommendationsEvent };
        case "error": {
          const tasks = { ...state.tasks };
          for (const id of TASK_ORDER) if (tasks[id].status === "running") tasks[id] = { ...tasks[id], status: "failed" };
          return { ...state, phase: "error", error: (d as { message?: string }).message ?? "Something went wrong.", tasks };
        }
        case "done":
          return state.phase === "running" ? { ...state, phase: "done" } : state;
        default:
          return state;
      }
    }
  }
}

export type AuditHandlers = {
  /** called once per finished run, with the final state */
  onDone?: (state: AuditState) => void;
  onError?: (message: string) => void;
};

export function useAudit(handlers: AuditHandlers = {}) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const handlersRef = useRef(handlers);
  // mirrors the reducer so the stream callback can hand the final state out
  const shadowRef = useRef<AuditState>(INITIAL);

  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  const run = useCallback((url: string, siteType: "auto" | SiteType = "auto") => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startAction: Action = { type: "start", url, siteType };
    shadowRef.current = reducer(shadowRef.current, startAction);
    const runId = shadowRef.current.runId;
    dispatch(startAction);

    const apply = (action: Action) => {
      shadowRef.current = reducer(shadowRef.current, action);
      dispatch(action);
    };

    postSSE(
      "/api/reviewer/audit",
      { url, siteType },
      (event, data) => {
        if (ctrl.signal.aborted) return;
        apply({ type: "event", runId, event, data });
        if (event === "error") handlersRef.current.onError?.((data as { message?: string }).message ?? "Something went wrong.");
        if (event === "done" && shadowRef.current.phase === "done") handlersRef.current.onDone?.(shadowRef.current);
      },
      ctrl.signal,
    ).catch((err: unknown) => {
      if (ctrl.signal.aborted) return;
      const raw = err instanceof Error ? err.message : String(err);
      let message = "Couldn't reach the auditor. Check your connection and try again.";
      const json = raw.match(/\{.*\}/);
      if (json) {
        try {
          message = (JSON.parse(json[0]) as { error?: string }).error ?? message;
        } catch {
          // keep the generic message
        }
      }
      apply({ type: "fail", runId, message });
      handlersRef.current.onError?.(message);
    });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const action: Action = { type: "reset" };
    shadowRef.current = reducer(shadowRef.current, action);
    dispatch(action);
  }, []);

  return { state, run, cancel };
}
