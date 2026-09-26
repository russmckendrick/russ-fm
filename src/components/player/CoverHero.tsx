import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Flood } from '@/lib/sleeveColour';

interface CoverHeroProps {
  flood: Flood;
  /** The cover object (usually <HeroRecord>). Hangs over the section below. */
  art: ReactNode;
  /** Extra classes for the art column, e.g. a wider cover on phones. */
  artClassName?: string;
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
export function CoverHero({ flood, art, artClassName, children, className }: CoverHeroProps) {
  return (
    <section
      className={cn('flood-surface relative z-[2] overflow-x-clip', className)}
      style={{ background: flood.flood, color: flood.ink }}
    >
      <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-8 px-5 pt-4 md:px-10 lg:flex-row lg:items-end lg:gap-0 lg:px-14 lg:pt-14">
        <div className={cn('order-2 -mb-12 w-[84%] max-w-[560px] shrink-0 self-start lg:order-1 lg:self-end lg:-mb-16 lg:w-[clamp(420px,46vw,780px)] lg:max-w-none', artClassName)}>
          {art}
        </div>
        <div className="order-1 min-w-0 flex-1 lg:order-2 lg:pb-14 lg:pl-[clamp(60px,9vw,150px)]">{children}</div>
      </div>
    </section>
  );
}
