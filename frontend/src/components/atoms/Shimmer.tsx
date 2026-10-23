import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/* Text with a light band sweeping through it — for "working…" labels. */
export function Shimmer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn("inline-block bg-clip-text text-transparent", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--ink-3) 0%, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%, var(--ink-3) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer-text 1.6s linear infinite",
      }}
    >
      {children}
    </span>
  );
}
