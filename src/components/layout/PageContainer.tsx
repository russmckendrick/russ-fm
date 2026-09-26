import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  /**
   * Container variant:
   * - 'standard': padded container for list/detail pages (albums, artists,
   *   search). Respects the editorial page gutters and max-width.
   * - 'hero': full-bleed wrapper for pages whose top section paints to the
   *   viewport edges (album/artist detail, random, stats hero). No
   *   horizontal padding — the page's hero is expected to manage its own.
   */
  variant?: "standard" | "hero";
  className?: string;
}

/**
 * Page shell on the dark ground. Navigation is sticky (not fixed) and lives
 * in the document flow, so pages do not reserve header-height top padding.
 * Standard pages get the max-1640 container with the same side gutters as
 * the navigation; hero pages go edge-to-edge.
 */
export function PageContainer({
  children,
  variant = "standard",
  className,
}: PageContainerProps) {
  const base =
    variant === "standard"
      ? "mx-auto w-full max-w-[1640px] px-5 py-8 text-[color:var(--cream)] md:px-10 md:py-12 lg:px-14"
      : "min-h-[100dvh] text-[color:var(--cream)]";

  return <div className={cn(base, className)}>{children}</div>;
}
