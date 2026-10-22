"use client";

import { useSyncExternalStore } from "react";

/* ─────────────────────────────────────────────────────────
 * FIX LIST — fixes the viewer accepted, shared between the
 * Recommendation Card and the header chip. Kept per viewer
 * in localStorage (guarded; private windows just forget).
 * ───────────────────────────────────────────────────────── */

export type FixItem = {
  key: string;
  url: string;
  host: string;
  title: string;
  detail: string;
  points?: number;
  addedAt: number;
};

const KEY = "reviewer:fixes:v1";
const EMPTY: FixItem[] = [];
let items: FixItem[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) {
      items = parsed.filter(
        (x): x is FixItem => !!x && typeof x === "object" && typeof (x as FixItem).key === "string" && typeof (x as FixItem).title === "string",
      );
    }
  } catch {
    items = EMPTY;
  }
}

function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // storage blocked; the list still works for this visit
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  load();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot(): FixItem[] {
  load();
  return items;
}

export function useFixList(): FixItem[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export function fixKey(url: string, id: string): string {
  return `${url}#${id}`;
}

export function hasFix(key: string): boolean {
  return snapshot().some((f) => f.key === key);
}

export function addFix(item: Omit<FixItem, "addedAt">) {
  load();
  if (items.some((f) => f.key === item.key)) return;
  items = [...items, { ...item, addedAt: Date.now() }];
  save();
  emit();
}

export function removeFix(key: string) {
  items = items.filter((f) => f.key !== key);
  save();
  emit();
}

export function clearFixes() {
  items = EMPTY;
  save();
  emit();
}

/** Markdown checklist for pasting into a ticket. */
export function fixesAsChecklist(list: FixItem[]): string {
  return list.map((f) => `- [ ] ${f.title} (${f.host})${f.detail ? `\n      ${f.detail}` : ""}`).join("\n");
}
