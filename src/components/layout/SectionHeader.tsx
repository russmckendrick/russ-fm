import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  /** Kept for compatibility; section numbers are no longer shown. */
  num?: string;
  /** Section title. */
  label: string;
  /** Optional count shown in dim mono beside the title. */
  count?: number;
  /** Optional right-hand action link (e.g., "See all"). */
  action?: string;
  actionTo?: string;
  className?: string;
}

/**
 * Plain section heading in the player style: a `t-disp` label, an optional
 * dim count and an optional "see all" link. Mirrors
 * `src/components/player/SectionHeading` for pages still using this API.
 */
export function SectionHeader({ label, count, action, actionTo, className }: SectionHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[color:var(--cream)]", className)}>
      <h2 className="t-disp m-0 text-[30px] md:text-[40px] lg:text-[48px]">{label}</h2>
      <span className="t-mono flex-1 text-[13px] text-[color:var(--cream-dim)]">
        {count != null ? count.toLocaleString() : null}
      </span>
      {action &&
        (actionTo ? (
          <Link to={actionTo} className="inline-flex min-h-[44px] items-center gap-2 font-bold hover:underline">
            {action}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-2 font-bold">
            {action}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        ))}
    </header>
  );
}
