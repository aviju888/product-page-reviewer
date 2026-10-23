import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PillTone = "neutral" | "accent" | "green" | "orange" | "red";

const TONES: Record<PillTone, string> = {
  neutral: "bg-field text-ink",
  accent: "bg-accent-tint text-accent-ink",
  green: "bg-green-tint text-green",
  orange: "bg-orange-tint text-orange",
  red: "bg-red-tint text-red",
};

/* An inline value inside running text: "lead time [7 days]". */
export function ValuePill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "num inline-flex h-[20px] translate-y-[-1px] items-center rounded-[5px] px-1.5 align-middle text-[12px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
