import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { inkOn } from '@/lib/sleeveColour';
import type { VinylLook } from '@/lib/vinylLook';

interface VinylProps {
  /** Centre-label colour, usually the sleeve's dark background swatch. */
  label: string;
  /** Sleeve image printed on the centre label instead of a flat colour. */
  cover?: string | null;
  /** A coloured pressing; without one the disc is black. */
  look?: VinylLook | null;
  spin?: boolean;
  /** Spin at 45 instead of 33⅓ (used while scrobbling). */
  fast?: boolean;
  /** Small text printed on the label. */
  text?: string;
  /** Anything else printed on the label (sized by the caller). */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** A vinyl record: grooves and a coloured centre label, spinning at 33⅓. */
export function Vinyl({ label, cover, look, spin = true, fast = false, text, children, className, style }: VinylProps) {
  return (
    <div className={cn('vinyl', className)} style={look ? { ...lookVars(look), ...style } : style} aria-hidden>
      <div className={cn('vinyl-grooves', spin && (fast ? 'spin-45' : 'spin-33'))}>
        <div className="vinyl-label" style={{ background: label }}>
          {cover && <LabelCover src={cover} />}
          {text && (
            <span
              className="t-mono max-w-[80%] text-center font-bold leading-tight"
              style={{ fontSize: 7, color: inkOn(label), marginTop: '-30%', letterSpacing: '0.08em' }}
            >
              {text}
            </span>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function lookVars(look: VinylLook): CSSProperties {
  return {
    '--vinyl-body': look.body,
    '--vinyl-pattern': look.pattern ?? 'none',
    '--vinyl-groove': look.groove,
    '--vinyl-rim': look.rim,
  } as CSSProperties;
}

/**
 * The sleeve on the label. When it changes, the new sleeve fades in over the
 * old one, which is dropped once the fade ends, so the label never flashes
 * back to its flat colour between records.
 */
function LabelCover({ src }: { src: string }) {
  const [layers, setLayers] = useState<string[]>([src]);

  useEffect(() => {
    setLayers(prev => (prev[prev.length - 1] === src ? prev : [...prev.slice(-1), src]));
  }, [src]);

  return (
    <>
      {layers.map((url, i) => (
        <img
          key={url}
          src={url}
          alt=""
          decoding="async"
          className={cn('vinyl-cover', i === layers.length - 1 && layers.length > 1 && 'vinyl-cover-in')}
          onAnimationEnd={() => setLayers(prev => (prev.length > 1 ? prev.slice(-1) : prev))}
        />
      ))}
    </>
  );
}
