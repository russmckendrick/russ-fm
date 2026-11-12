import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { RecordsFlood } from './useRecordsFlood';

interface FloodBandProps {
  /** From `useRecordsFlood`; null paints nothing until colours load. */
  flood: RecordsFlood | null;
  children: ReactNode;
  className?: string;
  /** Classes for the inner, max-width container. */
  innerClassName?: string;
  /**
   * Under a header photo (SleeveRoom): the band is glass straddling the photo's
   * bottom edge (`.glass-band-straddle`, player.css) rather than a block of the
   * flood, which only warms it. The cream tokens keep their own values.
   */
  glass?: boolean;
}

/**
 * A full-bleed header band in the page's lead sleeve colours, meeting the
 * nav. Inside it the cream tokens are remapped to the flood's ink (and
 * `--ground` to the flood), so titles, notes and solid pills written for the
 * dark ground read on the colour without changes.
 */
export function FloodBand({ flood, children, className, innerClassName, glass }: FloodBandProps) {
  if (glass) {
    return (
      <div className={cn('glass-band glass-band-straddle', className)} style={{ '--band-tint': flood?.top ?? 'transparent' } as CSSProperties}>
        <div className={cn('mx-auto w-full max-w-[1640px] px-5 pb-10 md:px-10 md:pb-14 lg:px-14', innerClassName)}>{children}</div>
      </div>
    );
  }
  const style = flood
    ? ({
        background: flood.background,
        color: flood.ink,
        '--cream': flood.ink,
        '--cream-dim': flood.sub,
        '--cream-rule': `color-mix(in oklab, ${flood.ink} 28%, transparent)`,
        '--ground': flood.top,
      } as CSSProperties)
    : undefined;
  return (
    <div className={cn('flood-surface', className)} style={style}>
      <div className={cn('mx-auto w-full max-w-[1640px] px-5 pb-10 pt-8 md:px-10 md:pb-14 md:pt-12 lg:px-14', innerClassName)}>
        {children}
      </div>
    </div>
  );
}
