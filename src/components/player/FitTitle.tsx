import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface FitTitleProps {
  children: string;
  /** Largest size in px; the title shrinks from here until its longest word fits. */
  max: number;
  min?: number;
  as?: 'h1' | 'h2';
  /**
   * Also shrink until the parent's content fits the parent's height. For a
   * title in a fixed-height column (the artist hero on desktop); where the
   * parent's height is auto this never binds.
   */
  fitHeight?: boolean;
  className?: string;
}

/**
 * A display title sized to its column: as big as `max`, but never so big that
 * a word has to break. Lines wrap only between words (balanced), so
 * "Depeche Mode" sets as DEPECHE / MODE rather than DEPEC / HE MODE. Only a
 * word too long to fit even at `min` is allowed to break.
 */
export function FitTitle({ children, max, min = 20, as: Tag = 'h1', fitHeight = false, className }: FitTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const fits = (size: number) => {
      el.style.fontSize = `${size}px`;
      if (el.scrollWidth > el.clientWidth + 1) return false;
      return !fitHeight || parent.scrollHeight <= parent.clientHeight + 1;
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
    // Fitting the height as well, also when anything else in the column changes
    // size or is added (stats and links arrive after the page renders).
    let width = parent.clientWidth;
    let height = parent.clientHeight;
    const siblings = new Set<Element>();
    const ro = new ResizeObserver(entries => {
      const parentChanged = parent.clientWidth !== width || parent.clientHeight !== height;
      if (parentChanged || (fitHeight && entries.some(e => e.target !== parent))) {
        width = parent.clientWidth;
        height = parent.clientHeight;
        fit();
      }
    });
    ro.observe(parent);
    const watchSiblings = () => {
      for (const child of Array.from(parent.children)) {
        if (child !== el && !siblings.has(child)) {
          siblings.add(child);
          ro.observe(child);
        }
      }
    };
    const mo = fitHeight ? new MutationObserver(() => { watchSiblings(); fit(); }) : null;
    if (fitHeight) {
      watchSiblings();
      mo!.observe(parent, { childList: true });
    }
    let alive = true;
    document.fonts?.ready.then(() => alive && fit());
    return () => {
      alive = false;
      ro.disconnect();
      mo?.disconnect();
    };
  }, [children, max, min, fitHeight]);

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
