import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Page-level primitives restyled for the player design: dark ground, cream
 * type, rounded ground-2 panels and plain labels. Props are unchanged so pages
 * that have not moved to src/components/player yet still match.
 */

type CountItem = {
  label: string;
  value: string | number;
};

export function DossierHero({
  kicker,
  title,
  subtitle,
  counts,
  actions,
  className,
  titleClassName,
}: {
  /** Kept for compatibility; section numbers are no longer shown. */
  num?: string;
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  counts?: CountItem[];
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <header className={cn("mb-10 font-grot text-[color:var(--cream)] md:mb-14", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <p className="t-kicker text-[color:var(--cream-dim)]">{kicker}</p>
        {actions}
      </div>

      <h1
        className={cn(
          "t-disp max-w-full break-words text-[clamp(44px,8vw,112px)]",
          titleClassName,
        )}
      >
        {title}
      </h1>

      {subtitle && (
        <p className="mt-5 max-w-[64ch] text-[16px] leading-[1.6] text-[color:var(--cream-dim)] md:text-[17px]">
          {subtitle}
        </p>
      )}

      {counts && counts.length > 0 && (
        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-5">
          {counts.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col-reverse gap-2">
              <dt className="t-mono text-[12px] uppercase text-[color:var(--cream-dim)]">{item.label}</dt>
              <dd className="t-cond text-[44px] leading-none md:text-[56px]">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

export function FactGrid({
  items,
  className,
  cellClassName,
}: {
  items: Array<CountItem | null | undefined | false>;
  className?: string;
  cellClassName?: string;
}) {
  const facts = items.filter(Boolean) as CountItem[];
  if (!facts.length) return null;

  return (
    <dl className={cn("grid grid-cols-2 gap-2", className)}>
      {facts.map((item) => (
        <FactCell
          key={item.label}
          label={item.label}
          value={item.value}
          className={cellClassName}
        />
      ))}
    </dl>
  );
}

export function FactCell({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl bg-[color:var(--ground-2)] px-4 py-3.5", className)}>
      <dt className="t-mono text-[11px] uppercase text-[color:var(--cream-dim)]">{label}</dt>
      <dd className="mt-1.5 min-w-0 break-words text-[17px] font-bold leading-tight text-[color:var(--cream)]">
        {value}
      </dd>
    </div>
  );
}

export function RailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h3 className="t-kicker mb-3 text-[color:var(--cream-dim)]">{title}</h3>
      {children}
    </section>
  );
}

export function CatalogueList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-[color:var(--cream-rule)] border-y border-[color:var(--cream-rule)]", className)}>
      {children}
    </ul>
  );
}

export function EditorialEmpty({
  title,
  detail,
  action,
  actionTo,
  className,
}: {
  title: string;
  detail?: string;
  action?: string;
  actionTo?: string;
  className?: string;
}) {
  const body = (
    <>
      <p className="t-disp text-[26px] md:text-[34px]">{title}</p>
      {detail && <p className="mx-auto mt-3 max-w-[52ch] text-[15px] text-[color:var(--cream-dim)]">{detail}</p>}
      {action && actionTo && <span className="pill mt-6">{action}</span>}
    </>
  );

  const classes = cn(
    "rounded-3xl bg-[color:var(--ground-2)] px-6 py-16 text-center text-[color:var(--cream)]",
    className,
  );

  return actionTo ? (
    <Link to={actionTo} className={cn("block", classes)}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

export function EditorialSkeleton({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("py-12", className)} aria-live="polite" aria-busy="true">
      <div className="mb-8 h-12 w-2/3 max-w-[560px] animate-pulse rounded-xl bg-[color:var(--ground-3)] motion-reduce:animate-none md:h-20" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="aspect-square animate-pulse bg-[color:var(--ground-2)] motion-reduce:animate-none"
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
      <p className="t-mono mt-6 text-[12px] uppercase text-[color:var(--cream-dim)]">{label}</p>
    </div>
  );
}

export function StageVinyl({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute aspect-square rounded-full border border-current bg-transparent text-[color:var(--cream-dim)] opacity-[0.28]",
        "before:absolute before:inset-[7%] before:rounded-full before:border before:border-current",
        "after:absolute after:inset-[18%] after:rounded-full after:border after:border-current",
        className,
      )}
    >
      <span className="absolute inset-[29%] rounded-full border border-current" />
      <span className="absolute inset-[41%] rounded-full border border-current" />
      <span className="absolute left-1/2 top-1/2 h-[9%] w-[9%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-current" />
    </div>
  );
}
