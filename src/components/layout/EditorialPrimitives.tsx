import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CountItem = {
  label: string;
  value: string | number;
};

export function DossierHero({
  num,
  kicker,
  title,
  subtitle,
  counts,
  actions,
  className,
  titleClassName,
}: {
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
    <header
      className={cn(
        "mb-10 border-b border-rule pb-8 font-grot text-ink md:mb-14 md:pb-10",
        className,
      )}
    >
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          {num && <span className="text-hl">{num}</span>}
          <span>{kicker}</span>
        </div>
        {actions}
      </div>

      <h1
        className={cn(
          "text-display max-w-[12ch] text-[clamp(48px,9vw,112px)] uppercase text-ink",
          titleClassName,
        )}
      >
        {title}
      </h1>

      {subtitle && (
        <p className="mt-5 max-w-[64ch] text-[15px] leading-[1.68] text-ink-2 md:text-[17px]">
          {subtitle}
        </p>
      )}

      {counts && counts.length > 0 && (
        <dl className="mt-7 grid gap-[1px] border border-rule-strong bg-rule-strong sm:grid-cols-2 lg:max-w-4xl lg:grid-cols-4">
          {counts.map((item) => (
            <FactCell key={item.label} label={item.label} value={item.value} />
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
    <dl
      className={cn(
        "grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong",
        className,
      )}
    >
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
    <div className={cn("bg-paper px-4 py-3.5", className)}>
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </dt>
      <dd className="mt-1.5 min-w-0 break-words font-grot text-[17px] font-semibold leading-tight text-ink">
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
      <h3 className="mb-3 border-b border-rule pb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        {title}
      </h3>
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
    <ul className={cn("divide-y divide-rule border-y border-rule", className)}>
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
      <p className="font-grot text-[18px] font-semibold text-ink">{title}</p>
      {detail && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
          {detail}
        </p>
      )}
      {action && actionTo && (
        <span className="mt-5 inline-flex border border-rule-strong px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink transition-[color,background-color,border-color] duration-200 hover:border-hl hover:bg-hl hover:text-paper">
          {action}
        </span>
      )}
    </>
  );

  const classes = cn(
    "border border-rule-strong bg-paper-2/50 px-6 py-16 text-center",
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
    <div className={cn("py-16", className)} aria-live="polite">
      <div className="mx-auto flex max-w-sm flex-col gap-3">
        <div className="h-3 w-24 animate-pulse bg-rule" />
        <div className="h-8 w-full animate-pulse bg-rule" />
        <div className="h-8 w-2/3 animate-pulse bg-rule" />
        <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          {label}
        </p>
      </div>
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
        "pointer-events-none absolute aspect-square rounded-full border border-stage-rule opacity-80",
        "bg-[radial-gradient(circle_at_50%_50%,rgba(247,242,232,0.34)_0_2%,rgba(8,8,7,0.9)_3%_14%,rgba(247,242,232,0.1)_15%,rgba(8,8,7,0.98)_18%,rgba(8,8,7,0.96)_100%)]",
        "shadow-[inset_0_0_0_1px_rgba(247,242,232,0.06),inset_0_0_40px_rgba(247,242,232,0.08)]",
        "before:absolute before:inset-[8%] before:rounded-full before:border before:border-stage-rule",
        "after:absolute after:inset-[18%] after:rounded-full after:border after:border-stage-rule",
        className,
      )}
    />
  );
}
