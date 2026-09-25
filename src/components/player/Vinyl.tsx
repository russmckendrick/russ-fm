import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { inkOn } from '@/lib/sleeveColour';

interface VinylProps {
  /** Centre-label colour, usually the sleeve's dark background swatch. */
  label: string;
  spin?: boolean;
  /** Spin at 45 instead of 33⅓ (used while scrobbling). */
  fast?: boolean;
  /** Small text printed on the label. */
  text?: string;
  className?: string;
  style?: CSSProperties;
}

/** A vinyl record: grooves and a coloured centre label, spinning at 33⅓. */
export function Vinyl({ label, spin = true, fast = false, text, className, style }: VinylProps) {
  return (
    <div className={cn('vinyl', className)} style={style} aria-hidden>
      <div className={cn('vinyl-grooves', spin && (fast ? 'spin-45' : 'spin-33'))}>
        <div className="vinyl-label" style={{ background: label }}>
          {text && (
            <span
              className="t-mono max-w-[80%] text-center font-bold leading-tight"
              style={{ fontSize: 7, color: inkOn(label), marginTop: '-30%', letterSpacing: '0.08em' }}
            >
              {text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
