import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Flood } from '@/lib/sleeveColour';

interface CoverHeroProps {
  flood: Flood;
  /** The cover object (usually <HeroRecord>). Hangs over the section below. */
  art: ReactNode;
  /** Extra classes for the art column, e.g. a wider cover on phones. */
  artClassName?: string;
  /**
   * Where the cover and text go side by side. 'md' puts them in a row on
   * tablets too (a smaller cover, so the whole hero fits the first screen);
   * the default keeps them stacked until lg.
   */
  splitAt?: 'md' | 'lg';
  children: ReactNode;
  className?: string;
}

/** Padding the section after a CoverHero needs to clear the overhanging cover. */
export const AFTER_HERO = 'pt-24 lg:pt-36';

/**
 * Cover-led hero: the page floods with the sleeve colour, the cover sits flush
 * on the bottom edge and hangs over the next section, and the text column
 * sits to the right (below the title on phones, cover last). Sideways overflow is
 * clipped so a record sliding off the edge (the scrobble scene) never widens the page;
 * the cover still hangs out of the bottom.
 */
export function CoverHero({ flood, art, artClassName, splitAt = 'lg', children, className }: CoverHeroProps) {
  const fromMd = splitAt === 'md';
  return (
    <section
      className={cn('flood-surface relative z-[2] overflow-x-clip', className)}
      style={{ background: flood.flood, color: flood.ink }}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-[1640px] flex-col gap-8 px-5 pt-4 md:px-10 lg:flex-row lg:items-end lg:gap-0 lg:px-14 lg:pt-14',
          fromMd && 'md:flex-row md:items-end md:gap-0 md:pt-10',
        )}
      >
        <div
          className={cn(
            'order-2 -mb-12 w-[84%] max-w-[560px] shrink-0 self-start lg:order-1 lg:self-end lg:-mb-16 lg:w-[clamp(420px,46vw,780px)] lg:max-w-none',
            // The record pokes out 15% of the cover's width, into the gap before the text.
            fromMd && 'md:order-1 md:self-end md:w-[40vw] md:max-w-none',
            artClassName,
          )}
        >
          {art}
        </div>
        <div
          className={cn(
            'order-1 min-w-0 flex-1 lg:order-2 lg:pb-14 lg:pl-[clamp(60px,9vw,150px)]',
            fromMd && 'md:order-2 md:pb-12 md:pl-[9vw]',
          )}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
