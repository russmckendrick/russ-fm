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
 * Editorial page shell. Navigation is sticky (not fixed) and lives in the
 * document flow, so pages no longer need to reserve header-height top
 * padding. Standard pages get the max-1640 gutter; hero pages go edge-to-
 * edge.
 */
export function PageContainer({
  children,
  variant = "standard",
  className,
}: PageContainerProps) {
  const base =
    variant === "standard"
      ? "mx-auto w-full max-w-[1640px] px-5 py-8 md:px-8 md:py-10"
      : "min-h-[100dvh]";

  return <div className={cn(base, className)}>{children}</div>;
}
