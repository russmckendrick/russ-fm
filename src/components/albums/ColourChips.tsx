import { useEffect, useMemo, useRef } from 'react';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { familyJumps } from '@/lib/colourFamilies';
import { CREAM, INK, colourFamily } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';

interface ColourChipsProps {
  /** The whole colour-sorted list, not just the visible page. */
  albums: Album[];
  colours: Record<string, AlbumColorPalette>;
  perPage: number;
  currentPage: number;
  /** Go to the page holding the record at `index`. */
  onJump: (index: number) => void;
}

/**
 * A row of paint chips, one per colour family on the wall. Each jumps to
 * the page where its colour starts; the chips for the families on the
 * current page sit raised and ringed.
 */
export function ColourChips({ albums, colours, perPage, currentPage, onJump }: ColourChipsProps) {
  const uris = useMemo(() => albums.map(a => a.uri_release), [albums]);
  const families = useMemo(() => familyJumps(uris, colours), [uris, colours]);

  const pageStart = (currentPage - 1) * perPage;
  // Usually one family per page, two where a colour starts mid-page.
  const onPage = useMemo(
    () => new Set(uris.slice(pageStart, pageStart + perPage).map(u => colourFamily(colours[u]))),
    [uris, colours, pageStart, perPage],
  );

  // On phones the chips scroll sideways; keep the current colour in view.
  const rowRef = useRef<HTMLDivElement>(null);
  const firstOnPage = families.find(f => onPage.has(f.id))?.id;
  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: chip.offsetLeft - row.offsetLeft - 20 });
  }, [firstOnPage]);

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Jump to a colour"
      className="shelf-scroll -mx-5 -my-3 scroll-px-5 gap-3 px-5 py-3 md:mx-0 md:overflow-visible md:px-0"
    >
      {families.map(f => {
        const on = onPage.has(f.id);
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            aria-label={`${f.label}, ${f.count.toLocaleString('en-GB')} records`}
            onClick={() => onJump(f.index)}
            className={cn(
              'flex w-[92px] shrink-0 flex-col overflow-hidden rounded-[6px] text-left shadow-[0_10px_24px_-14px_rgba(0,0,0,.6)] transition-transform duration-300 hover:-translate-y-1 md:w-auto md:min-w-0 md:flex-1',
              on && '-translate-y-1 ring-[3px] ring-[color:var(--cream)] ring-offset-2 ring-offset-[color:var(--ground)]',
            )}
            style={{ background: CREAM, color: INK }}
          >
            <span className="block h-14 md:h-20" style={{ background: f.chip }} aria-hidden />
            <span className="flex items-baseline justify-between gap-x-2 px-2.5 pb-2 pt-1.5 md:flex-col md:items-start md:px-3 xl:flex-row xl:items-baseline" aria-hidden>
              <span className="truncate text-[13px] font-bold">{f.label}</span>
              <span className="t-mono text-[11px] opacity-55">{f.count.toLocaleString('en-GB')}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
