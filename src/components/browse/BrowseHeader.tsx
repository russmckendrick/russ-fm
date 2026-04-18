import { cn } from "@/lib/utils";

interface BrowseHeaderProps {
  num: string;
  kicker: string;
  title: string;
  subtitle?: string;
  counts?: Array<{ label: string; value: string | number }>;
  className?: string;
}

/**
 * Editorial header for browse pages. Mirrors the `SectionHeader` idiom
 * but scaled up for full-page use: kicker row → display title →
 * optional subtitle → optional mono count strip. Single hairline rule
 * closes it off.
 */
export function BrowseHeader({
  num,
  kicker,
  title,
  subtitle,
  counts,
  className,
}: BrowseHeaderProps) {
  return (
    <header
      className={cn(
        "mb-8 border-b border-rule pb-6 font-grot text-ink",
        className
      )}
    >
      <div className="mb-3 flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim">
        <span className="text-hl">{num}</span>
        <span>{kicker}</span>
      </div>

      <h1 className="text-[clamp(32px,5.5vw,56px)] font-semibold leading-[1.02] tracking-[-0.02em] text-ink">
        {title}
      </h1>

      {subtitle && (
        <p className="mt-3 max-w-[62ch] text-[14px] leading-[1.6] text-ink-2">
          {subtitle}
        </p>
      )}

      {counts && counts.length > 0 && (
        <dl className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
          {counts.map((c) => (
            <div key={c.label} className="flex items-baseline gap-2">
              <dt>{c.label}</dt>
              <dd className="font-grot text-[15px] font-semibold tracking-[-0.01em] text-ink">
                {c.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
