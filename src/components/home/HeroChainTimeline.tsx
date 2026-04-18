import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface HeroChainTimelineProps {
  total: number;
  activeIndex: number;
  autoRotateMs: number;
  onSelect: (index: number) => void;
  labels?: string[];
}

/**
 * Full-width timer line split into `total` equal segments, doubling as
 * the divider between the hero and the page body. The active segment
 * sweeps 0 → 100% over `autoRotateMs` (restarted via `key` on every
 * index change); completed segments stay filled, upcoming ones are
 * hairlines. Segments are clickable — jumping calls `onSelect(i)`.
 */
export function HeroChainTimeline({
  total,
  activeIndex,
  autoRotateMs,
  onSelect,
  labels,
}: HeroChainTimelineProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  const handleKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      const next = (activeIndex + delta + total) % total;
      onSelect(next);
      const btn = rowRef.current?.querySelectorAll<HTMLButtonElement>("button")[next];
      btn?.focus();
    },
    [activeIndex, total, onSelect],
  );

  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label="Featured album timeline"
      onKeyDown={handleKey}
      className="relative flex w-full border-t border-rule bg-[color-mix(in_oklab,var(--paper)_88%,var(--album-bg,var(--album-bg-fallback))_12%)]"
    >
      {Array.from({ length: total }).map((_, i) => {
        const state: "completed" | "active" | "upcoming" =
          i < activeIndex ? "completed" : i === activeIndex ? "active" : "upcoming";
        const label = labels?.[i] ?? `Album ${i + 1}`;
        const numeric = String(i + 1).padStart(2, "0");

        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-current={state === "active" ? "step" : undefined}
            aria-label={`Jump to featured album ${i + 1} of ${total}: ${label}`}
            title={`${numeric} · ${label}`}
            tabIndex={state === "active" ? 0 : -1}
            onClick={() => onSelect(i)}
            className={cn(
              "group relative flex-1 cursor-pointer bg-transparent p-0",
              "focus-visible:outline-none",
              i > 0 && "border-l border-rule",
            )}
          >
            <span className="sr-only">
              {numeric} of {String(total).padStart(2, "0")} — {label}
            </span>

            <span
              aria-hidden
              className={cn(
                "block h-[2px] w-full transition-[height,background-color] duration-200",
                "group-hover:h-[3px]",
                "group-focus-visible:h-[3px]",
                state === "active" && "h-[3px]",
              )}
              style={{
                backgroundColor:
                  state === "completed"
                    ? "color-mix(in oklab, var(--album-accent, var(--album-accent-fallback)) 62%, var(--album-muted, var(--album-muted-fallback)) 38%)"
                    : state === "active"
                      ? "color-mix(in oklab, var(--album-muted, var(--album-muted-fallback)) 28%, transparent)"
                      : "color-mix(in oklab, var(--rule-strong) 70%, transparent)",
              }}
            />

            {state === "active" && (
              <span
                key={activeIndex}
                aria-hidden
                className="hero-chain-fill absolute left-0 top-0 block h-[3px]"
                style={{
                  backgroundColor:
                    "var(--album-accent, var(--album-accent-fallback))",
                  animationDuration: `${autoRotateMs}ms`,
                }}
              />
            )}

            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute left-1/2 top-[6px] -translate-x-1/2",
                "font-mono text-[9px] uppercase tracking-[0.18em]",
                "opacity-0 transition-opacity duration-200",
                "group-hover:opacity-70 group-focus-visible:opacity-70",
                state === "active" && "opacity-60",
              )}
              style={{ color: "var(--ink-3)" }}
            >
              {numeric}
            </span>

            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0",
                "ring-2 ring-offset-0 ring-transparent",
                "group-focus-visible:ring-[color:var(--album-fg,var(--album-fg-fallback))]",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
