import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { inkOn } from '@/lib/sleeveColour';
import type { VinylLook } from '@/lib/vinylLook';
import { Vinyl } from './Vinyl';

interface SpinningMarkProps {
  /** Disc diameter in px. */
  size: number;
  /** Label colour when there is no cover. */
  label: string;
  /** Sleeve of the record the page is showing, printed on the label. */
  cover?: string | null;
  /** The pressing's colour for the record the page is showing; black without one. */
  look?: VinylLook | null;
  className?: string;
}

/**
 * The russ.fm logo: a record spinning at 33⅓. On pages that feature one record
 * (home hero, album, artist) its label carries that sleeve; elsewhere the label
 * is the page colour with a mark so the spin reads.
 */
export function SpinningMark({ size, label, cover, look, className }: SpinningMarkProps) {
  return (
    <span
      className={cn('spin-mark relative block shrink-0', !cover && 'spin-mark-plain', className)}
      style={{ width: size, height: size, '--mark-tick': inkOn(label) } as CSSProperties}
      aria-hidden
    >
      <Vinyl label={label} cover={cover} look={look} className="vinyl-lit inset-0" />
    </span>
  );
}
