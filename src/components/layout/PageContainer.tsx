import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  /**
   * Container variant:
   * - 'standard': For listing pages (Albums, Artists, Search) - provides header offset
   * - 'hero': For full-bleed hero pages - negates main padding so hero can extend edge-to-edge
   */
  variant?: 'standard' | 'hero';
  className?: string;
}

/**
 * PageContainer - Standardized layout container for consistent header spacing
 *
 * Spacing logic:
 * - App.tsx main has `pt-0 md:pt-32` (0 mobile, 128px desktop)
 * - 'standard' variant: Adds mobile padding only (desktop uses main's padding)
 * - 'hero' variant: Negates main padding so hero sections can go full-bleed
 */
export function PageContainer({
  children,
  variant = 'standard',
  className
}: PageContainerProps) {
  const baseClasses = variant === 'standard'
    // Standard: container with mobile padding only (desktop uses main's md:pt-32)
    ? 'container mx-auto px-4 pt-24 md:pt-0 pb-8'
    // Hero: negate main's padding for full-bleed heroes (they handle their own top padding)
    : 'min-h-screen pb-20 -mt-0 md:-mt-32';

  return (
    <div className={cn(baseClasses, className)}>
      {children}
    </div>
  );
}
