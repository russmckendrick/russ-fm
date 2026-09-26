import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { useCollection } from '@/lib/collection';
import { useAlbumColorMap, type AlbumColorPalette } from '@/hooks/useAlbumColors';
import { getAlbumImageFromData } from '@/lib/image-utils';
import { colourSortKey, inkOn, vividFrom } from '@/lib/sleeveColour';
import { originalYear } from '@/lib/releaseYear';
import { appConfig } from '@/config/app.config';
import { cn } from '@/lib/utils';
import { RecordTile } from '@/components/player';
import type { Album } from '@/types/album';

const SORTS = [
  { value: 'date_added', label: 'Date added' },
  { value: 'release_name', label: 'A–Z' },
  { value: 'release_artist', label: 'Artist' },
  { value: 'date_release_year', label: 'Year' },
  { value: 'colour', label: 'Colour' },
] as const;

/** Formats shown as quick filters; anything else is reachable via the URL. */
const FORMAT_CHIPS = [
  { value: 'Vinyl', label: 'Vinyl' },
  { value: 'Box Set', label: 'Box sets' },
];

export function AlbumsPage() {
  const { page } = useParams<{ page?: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { albums: collection, loading } = useCollection();
  const colours = useAlbumColorMap();

  useEffect(() => {
    if (page && Number.isNaN(parseInt(page, 10))) navigate(`/album/${page}`, { replace: true });
  }, [page, navigate]);

  const genre = params.get('genre') || 'all';
  const year = params.get('year') || 'all';
  const format = params.get('format') || 'all';
  const sort = params.get('sort') || 'date_added';
  const search = params.get('search') || '';
  const currentPage = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
  const colourMode = sort === 'colour';
  const perPage = appConfig.pagination.itemsPerPage.albums * (colourMode ? 2 : 1);

  usePageTitle(
    ['Albums', genre !== 'all' && genre, year !== 'all' && year, search && `“${search}”`, currentPage > 1 && `Page ${currentPage}`, 'russ.fm']
      .filter(Boolean)
      .join(' · '),
  );

  const albums = useMemo(() => excludeBoxsetMembers(collection), [collection]);

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => {
      const isDefault = v === '' || v === 'all' || (k === 'sort' && v === 'date_added');
      if (isDefault) p.delete(k);
      else p.set(k, v);
    });
    const qs = p.toString();
    navigate(qs ? `/albums/1?${qs}` : '/albums/1');
  };

  const pageUrl = (n: number) => {
    const qs = params.toString();
    return qs ? `/albums/${n}?${qs}` : `/albums/${n}`;
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    let out = albums.filter(a => {
      if (term) {
        const hit =
          a.release_name.toLowerCase().includes(term) ||
          a.release_artist.toLowerCase().includes(term) ||
          a.genre_names.some(g => g.toLowerCase().includes(term)) ||
          a.artists?.some(x => x.name.toLowerCase().includes(term)) ||
          a.members?.some(m => m.name.toLowerCase().includes(term));
        if (!hit) return false;
      }
      if (genre !== 'all' && !a.genre_names.includes(genre)) return false;
      if (year !== 'all' && String(originalYear(a)) !== year) return false;
      if (format !== 'all' && a.format_primary !== format) return false;
      return true;
    });

    if (sort === 'colour') {
      // Bold sleeves by hue, then monochrome sleeves light to dark.
      const keys = new Map(out.map(a => [a, colourSortKey(colours?.[a.uri_release])]));
      out = [...out].sort((a, b) => keys.get(a)! - keys.get(b)!);
    } else {
      out = [...out].sort((a, b) => {
        switch (sort) {
          case 'release_name':
            return a.release_name.localeCompare(b.release_name);
          case 'release_artist':
            return a.release_artist.localeCompare(b.release_artist);
          // The URL value predates year_original; it sorts by original release year.
          case 'date_release_year':
            return (originalYear(b) ?? 0) - (originalYear(a) ?? 0);
          default:
            return new Date(b.date_added).getTime() - new Date(a.date_added).getTime();
        }
      });
    }
    return out;
  }, [albums, colours, search, genre, year, format, sort]);

  const genres = useMemo(
    () => [...new Set(albums.flatMap(a => a.genre_names))].filter(g => g.toLowerCase() !== 'music').sort(),
    [albums],
  );
  const years = useMemo(
    () =>
      [...new Set(albums.map(a => originalYear(a)).filter((y): y is number => y !== null).map(String))]
        .sort((a, b) => Number(b) - Number(a)),
    [albums],
  );
  const formatCounts = useMemo(() => {
    const c: Record<string, number> = {};
    albums.forEach(a => {
      if (a.format_primary) c[a.format_primary] = (c[a.format_primary] ?? 0) + 1;
    });
    return c;
  }, [albums]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const start = (currentPage - 1) * perPage;
  const visible = filtered.slice(start, start + perPage);
  const filteredAny = genre !== 'all' || year !== 'all' || format !== 'all' || !!search;

  return (
    <div className="mx-auto w-full max-w-[1640px] px-5 pb-10 pt-8 md:px-10 lg:px-14 lg:pt-12">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <h1 className="t-disp m-0 text-[64px] md:text-[96px] lg:text-[120px]">Albums</h1>
        <span className="t-disp text-[64px] text-[color:var(--ground-3)] md:text-[96px] lg:text-[120px]" aria-label={`${filtered.length} records`}>
          {loading ? '' : filtered.length.toLocaleString('en-GB')}
        </span>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Sort" className="flex flex-wrap gap-1 rounded-[28px] bg-[color:var(--ground-2)] p-1">
            {SORTS.map(s => (
              <button
                key={s.value}
                type="button"
                aria-pressed={sort === s.value}
                onClick={() => update({ sort: s.value })}
                className={cn(
                  'h-11 rounded-full px-4 text-[14px] font-bold transition-colors md:px-5',
                  sort === s.value ? 'bg-[color:var(--cream)] text-[color:var(--ground)]' : 'hover:bg-[color:var(--ground-3)]',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Format" className="flex flex-wrap gap-2">
            {FORMAT_CHIPS.filter(f => formatCounts[f.value]).map(f => {
              const on = format === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ format: on ? 'all' : f.value })}
                  className={cn('pill pill-sm', on ? 'border-[color:var(--cream)]' : 'border-[color:var(--ground-3)]')}
                >
                  {f.label}
                  <span className="t-mono text-[11px] text-[color:var(--cream-dim)]">{formatCounts[f.value].toLocaleString('en-GB')}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border-2 border-[color:var(--ground-3)] px-4 focus-within:border-[color:var(--cream)] sm:max-w-[360px]">
            <Search className="h-[18px] w-[18px] shrink-0 text-[color:var(--cream-dim)]" aria-hidden />
            <input
              type="search"
              defaultValue={search}
              key={search}
              placeholder="Search albums"
              aria-label="Search albums"
              onKeyDown={e => {
                if (e.key === 'Enter') update({ search: (e.target as HTMLInputElement).value.trim() });
              }}
              onBlur={e => {
                if (e.target.value.trim() !== search) update({ search: e.target.value.trim() });
              }}
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[color:var(--cream-dim)]"
            />
          </label>
          <PillSelect label="Genre" value={genre} options={genres} onChange={v => update({ genre: v })} />
          <PillSelect label="Year" value={year} options={years} onChange={v => update({ year: v })} />
          {filteredAny && (
            <button type="button" className="pill pill-sm border-transparent opacity-80 hover:opacity-100" onClick={() => navigate(sort === 'date_added' ? '/albums/1' : `/albums/1?sort=${sort}`)}>
              <X className="h-4 w-4" aria-hidden />
              Clear filters
            </button>
          )}
        </div>

        {colourMode && colours && visible.length > 0 && (
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full" aria-hidden>
            {visible.map(a => (
              <span key={a.uri_release} className="flex-1" style={{ background: vividFrom(colours[a.uri_release]) ?? '#3a3530' }} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-10">
        {loading ? (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6" aria-busy="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse bg-[color:var(--ground-2)]" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-start gap-4 py-20">
            <p className="t-disp m-0 text-[36px]">No albums found</p>
            <p className="text-[color:var(--cream-dim)]">Try a different search or clear the filters.</p>
          </div>
        ) : colourMode ? (
          <ColourWall albums={visible} colours={colours} />
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7 xl:grid-cols-6">
            {visible.map(a => (
              <RecordTile
                key={a.uri_release}
                album={a}
                palette={colours?.[a.uri_release]}
                meta={[originalYear(a), a.format_primary].filter(Boolean).join(' · ')}
              />
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && <Pager current={currentPage} total={totalPages} url={pageUrl} />}
    </div>
  );
}

function ColourWall({ albums, colours }: { albums: Album[]; colours: Record<string, AlbumColorPalette> | null }) {
  return (
    <div className="-mx-5 grid grid-cols-4 sm:grid-cols-6 md:mx-0 lg:grid-cols-8">
      {albums.map(a => {
        const bg = vividFrom(colours?.[a.uri_release]) ?? '#e8e2d6';
        return (
          <Link key={a.uri_release} to={a.uri_release} className="tile aspect-square" aria-label={`${a.release_name} by ${a.release_artist}`}>
            <img src={getAlbumImageFromData(a.uri_release, 'medium')} alt="" loading="lazy" />
            <span className="tile-cap flex flex-col gap-0.5" style={{ background: bg, color: inkOn(bg) }} aria-hidden>
              <span className="truncate text-[13px] font-bold">{a.release_name}</span>
              <span className="truncate text-[12px] opacity-80">{a.release_artist}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function PillSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const on = value !== 'all';
  return (
    <label
      className={cn(
        'relative flex h-11 items-center gap-2 rounded-full border-2 pl-4 pr-3 text-[14px] font-bold',
        on ? 'border-[color:var(--cream)]' : 'border-[color:var(--ground-3)]',
      )}
    >
      <span className="text-[color:var(--cream-dim)]">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="max-w-[180px] cursor-pointer appearance-none bg-transparent pr-5 outline-none"
        aria-label={label}
      >
        <option value="all" className="bg-[color:var(--ground-2)]">
          All
        </option>
        {options.map(o => (
          <option key={o} value={o} className="bg-[color:var(--ground-2)]">
            {o}
          </option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute right-3 h-4 w-4 rotate-90" aria-hidden />
    </label>
  );
}

function Pager({ current, total, url }: { current: number; total: number; url: (n: number) => string }) {
  const pages: Array<number | '…'> = [];
  const span = appConfig.pagination.showPageNumbers;
  if (total <= span + 2) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    let lo = Math.max(2, current - Math.floor(span / 2));
    const hi = Math.min(total - 1, lo + span - 1);
    lo = Math.max(2, hi - span + 1);
    if (lo > 2) pages.push('…');
    for (let i = lo; i <= hi; i++) pages.push(i);
    if (hi < total - 1) pages.push('…');
    pages.push(total);
  }
  return (
    <nav aria-label="Pages" className="mt-14 flex flex-wrap items-center justify-center gap-2 border-t border-[color:var(--cream-rule)] pt-8">
      <Link
        to={url(Math.max(1, current - 1))}
        aria-label="Previous page"
        aria-disabled={current === 1}
        className={cn('icon-btn border-2 border-[color:var(--ground-3)]', current === 1 && 'pointer-events-none opacity-40')}
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="t-mono px-2 text-[color:var(--cream-dim)]">
            …
          </span>
        ) : (
          <Link
            key={p}
            to={url(p)}
            aria-current={p === current ? 'page' : undefined}
            className={cn(
              'grid h-11 min-w-11 place-items-center rounded-full px-3 text-[14px] font-bold',
              p === current ? 'bg-[color:var(--cream)] text-[color:var(--ground)]' : 'hover:bg-[color:var(--ground-2)]',
            )}
          >
            {p}
          </Link>
        ),
      )}
      <Link
        to={url(Math.min(total, current + 1))}
        aria-label="Next page"
        aria-disabled={current === total}
        className={cn('icon-btn border-2 border-[color:var(--ground-3)]', current === total && 'pointer-events-none opacity-40')}
      >
        <ChevronRight className="h-5 w-5" />
      </Link>
    </nav>
  );
}
