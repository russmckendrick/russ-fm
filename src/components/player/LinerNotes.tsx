import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Body copy as liner notes (the album's About text, the artist's biography): the
 * first paragraph set large as a lede across the full column, the rest under it in
 * as many columns as it can fill (one for a few lines, then two). `wide` is for a
 * column that spans the page (the artist page): a bigger lede, and a third column
 * from xl when the copy is long.
 */
export function LinerNotes({ text, wide = false }: { text: string; wide?: boolean }) {
  const [lede, ...rest] = text.split('\n').map(p => p.trim()).filter(Boolean);
  if (!lede) return null;
  // Columns only when there is enough copy to fill them: a few lines split three
  // ways reads as scraps, and one narrow column reads as a column with its
  // neighbours missing, so short copy spans the full width under the lede.
  const length = rest.reduce((n, p) => n + p.length, 0);
  const columns = length < 700 ? 1 : wide && length >= 1300 ? 3 : 2;
  return (
    <div className="flex flex-col gap-7">
      <p className={cn('m-0 text-[20px] font-medium leading-[1.45] text-[color:var(--cream)] md:text-[24px]', wide && 'xl:text-[28px] xl:leading-[1.4]')}>{lede}</p>
      {rest.length > 0 && (
        <div
          className={cn(
            'gap-12 leading-[1.7] text-[color:var(--ink-2)]',
            // Too little for columns: it spans the column like the lede, a size up so the long lines stay readable.
            columns === 1 ? cn('text-[17px] md:text-[19px]', wide && 'xl:text-[21px] xl:leading-[1.6]') : 'text-[16px] md:text-[17px] lg:columns-2',
            columns === 3 && 'xl:columns-3',
          )}
        >
          {rest.map((p, i) => (
            <p key={i} className="m-0 mb-4 last:mb-0">{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible body copy. Clips text with a fade in the page's ground colour and a
 * "Read more" pill sitting on the fade (no row of its own), but only when it is
 * really long: the copy is measured, and it collapses only if it runs at least
 * `spare` px past the collapsed height, so "Read more" never opens onto just a
 * line or two.
 */
export function ExpandableBody({ children, fade, collapsedMaxHeight = 300, spare = 220 }: { children: ReactNode; fade: string; collapsedMaxHeight?: number; spare?: number }) {
  const inner = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Measured before the first paint, and again when the column's width changes the wrapping.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setFull(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const long = full !== null && full > collapsedMaxHeight + spare;
  const clipped = long && !expanded;
  return (
    <div>
      <div
        className={cn('relative', long && 'overflow-hidden transition-[max-height] duration-500 ease-out')}
        style={long ? { maxHeight: expanded ? `${full}px` : `${collapsedMaxHeight}px` } : undefined}
      >
        <div ref={inner}>{children}</div>
        {clipped && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-32" style={{ background: `linear-gradient(to top, ${fade} 30%, transparent)` }} />}
        {/* Over the fade, so the control takes no row of its own. */}
        {clipped && (
          <button type="button" onClick={() => setExpanded(true)} aria-expanded={false} className="pill pill-sm absolute bottom-0 left-0 border-[color:var(--cream-rule)]">
            Read more
          </button>
        )}
      </div>
      {long && expanded && (
        <button type="button" onClick={() => setExpanded(false)} aria-expanded className="t-mono mt-3 text-[12px] uppercase text-[color:var(--cream-dim)] underline underline-offset-4 hover:text-[color:var(--cream)]">
          Show less
        </button>
      )}
    </div>
  );
}
