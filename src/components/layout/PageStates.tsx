import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/*
 * Empty and loading states shared by the list pages (genres, browse, facets),
 * styled for the player design: dark ground, cream type, ground-2 panels.
 */

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
