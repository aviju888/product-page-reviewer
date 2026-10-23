import type { SampleId } from "./types";

/* ─────────────────────────────────────────────────────────
 * SAMPLES — two self-contained product pages in
 * public/reviewer/samples, for offline demos. Fictional
 * brands; each has the URL it "lives" at so URL checks
 * (HTTPS, canonical) read naturally.
 * ───────────────────────────────────────────────────────── */

export const SAMPLES: Record<SampleId, { file: string; url: string; label: string; short: string }> = {
  strong: {
    file: "strong.html",
    url: "https://kestrel.example/products/trail-bottle-750",
    label: "Kestrel Trail Bottle",
    short: "strong page",
  },
  weak: {
    file: "weak.html",
    url: "http://aquamax.example/products/the-bottle",
    label: "AquaMax Bottle",
    short: "weak page",
  },
};

/** "sample:strong" → "strong". */
export function sampleIdOf(input: string): SampleId | null {
  const m = input.trim().match(/^sample:(strong|weak)$/i);
  return m ? (m[1].toLowerCase() as SampleId) : null;
}

export function sampleRef(id: SampleId): string {
  return `sample:${id}`;
}
