import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  /** Zero-padded section number string, e.g. "01". */
  num?: string;
  /** Section title. Shown in grot. */
  label: string;
  /** Optional `NN ITEMS` count rendered in mono next to the title. */
  count?: number;
  /** Optional right-hand action link (e.g., "View all →"). */
  action?: string;
  actionTo?: string;
  className?: string;
}

/**
 * Editorial section heading. One mono number (optional) + one grot label
 * with a rule underneath, plus an optional right-hand link. Used at the
 * head of every home-page block, browse page, and detail-page section.
 */
export function SectionHeader({
  num,
  label,
  count,
  action,
  actionTo,
  className,
}: SectionHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-3",
        className
      )}
    >
      <div className="flex flex-wrap items-baseline gap-4">
        {num && (
          <span className="font-mono text-[11px] leading-none tracking-[0.08em] text-hl">
            {num}
          </span>
        )}
        <h2 className="font-display text-[clamp(22px,2.4vw,32px)] uppercase leading-none text-ink">
          {label}
        </h2>
        {count != null && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dim">
            {String(count).padStart(3, "0")} items
          </span>
        )}
      </div>
      {action &&
        (actionTo ? (
          <Link
            to={actionTo}
            className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 transition-colors hover:text-hl"
          >
            {action} <span aria-hidden>→</span>
          </Link>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
            {action} <span aria-hidden>→</span>
          </span>
        ))}
    </header>
  );
}
