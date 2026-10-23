"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * STREAM TEXT — reveals `text` word by word, like a model
 * streaming. Calls onProgress after each paint (so anchored
 * UI can follow the growing text) and onDone at the end.
 * Reduced motion shows the full text at once.
 * ───────────────────────────────────────────────────────── */

export function StreamText({
  text,
  wordsPerSecond = 28,
  onProgress,
  onDone,
}: {
  text: string;
  wordsPerSecond?: number;
  onProgress?: () => void;
  onDone?: () => void;
}) {
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  // count is tied to the text it was counted for, so a new text starts at 0
  const [progress, setProgress] = useState({ text, count: 0 });
  const count = progress.text === text ? progress.count : 0;

  const cb = useRef({ onProgress, onDone });
  useEffect(() => {
    cb.current = { onProgress, onDone };
  });

  useEffect(() => {
    const total = words.length;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => {
        setProgress({ text, count: total });
        cb.current.onDone?.();
      });
      return () => cancelAnimationFrame(id);
    }
    let i = 0;
    const step = 1000 / (wordsPerSecond * 2); // tokens include whitespace runs
    const t = setInterval(() => {
      i += 1;
      setProgress({ text, count: i });
      if (i >= total) {
        clearInterval(t);
        cb.current.onDone?.();
      }
    }, step);
    return () => clearInterval(t);
  }, [words, text, wordsPerSecond]);

  useEffect(() => {
    cb.current.onProgress?.();
  }, [count]);

  return <>{words.slice(0, count).join("")}</>;
}
