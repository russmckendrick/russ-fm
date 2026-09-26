import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface FitTitleProps {
  children: string;
  /** Largest size in px; the title shrinks from here until its longest word fits. */
  max: number;
  min?: number;
  as?: 'h1' | 'h2';
  className?: string;
}

/**
 * A display title sized to its column: as big as `max`, but never so big that
 * a word has to break. Lines wrap only between words (balanced), so
 * "Depeche Mode" sets as DEPECHE / MODE rather than DEPEC / HE MODE. Only a
 * word too long to fit even at `min` is allowed to break.
 */
export function FitTitle({ children, max, min = 20, as: Tag = 'h1', className }: FitTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const fits = (size: number) => {
      el.style.fontSize = `${size}px`;
      return el.scrollWidth <= el.clientWidth + 1;
    };
    const fit = () => {
      el.style.overflowWrap = '';
      if (fits(max)) return;
      // A single word too long even at the smallest size may break, rather than clip.
      if (!fits(min)) {
        el.style.overflowWrap = 'anywhere';
        return;
      }
      let lo = min;
      let hi = max;
      while (hi - lo > 1) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      el.style.fontSize = `${Math.floor(lo)}px`;
    };

    fit();
    // Refit when the column changes width, and once the display font has loaded.
    let width = parent.clientWidth;
    const ro = new ResizeObserver(() => {
      if (parent.clientWidth !== width) {
        width = parent.clientWidth;
        fit();
      }
    });
    ro.observe(parent);
    let alive = true;
    document.fonts?.ready.then(() => alive && fit());
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [children, max, min]);

  return (
    <Tag
      ref={ref}
      className={cn('m-0 [overflow-wrap:normal] [text-wrap:balance] [word-break:normal]', className)}
      style={{ fontSize: max }}
    >
      {children}
    </Tag>
  );
}
