import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { SectionHeading } from '@/components/player';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { floodFor } from '@/lib/sleeveColour';
import type { TvArtistListing } from '@/lib/tv';
import { cn } from '@/lib/utils';

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** The A–Z bucket for a name, as on /artists: first letter, accents dropped, else "#". */
function letterOf(name: string): string {
  const first = name.normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

/**
 * The guide's artist channels (/tv/artist/:slug): too many for grid rows, so a
 * letter at a time (or a search), each artist a tile in the colour of their
 * newest record with videos.
 */
export function TvArtistChannels({ artists }: { artists: TvArtistListing[] }) {
  const colours = useAlbumColorMap();
  const byLetter = useMemo(() => {
    const map = new Map<string, TvArtistListing[]>();
    for (const a of artists) {
      const l = letterOf(a.name);
      if (!map.has(l)) map.set(l, []);
      map.get(l)!.push(a);
    }
    return map;
  }, [artists]);
  const [letter, setLetter] = useState(() => LETTERS.find(l => l !== '#' && byLetter.has(l)) ?? '#');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const shown = q ? artists.filter(a => a.name.toLowerCase().includes(q)) : (byLetter.get(letter) ?? []);

  return (
    <section className="mt-16 md:mt-20" aria-labelledby="tv-artist-channels">
      <SectionHeading title={<span id="tv-artist-channels">Artist channels</span>} size="sm" note={`${artists.length.toLocaleString('en-GB')} artists`} />

      <label className="mt-5 flex h-12 min-w-0 items-center gap-3 rounded-full border-2 border-[color:var(--cream-rule)] bg-[var(--ground-2)] px-5 transition-colors focus-within:border-[color:var(--cream)] lg:w-[360px]">
        <Search className="h-[18px] w-[18px] shrink-0 text-[color:var(--cream-dim)]" aria-hidden />
        <input
          type="search"
          placeholder="Find an artist"
          aria-label="Find an artist channel"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="h-full w-full min-w-0 bg-transparent text-[15px] text-[color:var(--cream)] placeholder:text-[color:var(--cream-dim)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-[color:var(--cream-dim)] hover:text-[color:var(--cream)]">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </label>

      <nav aria-label="Artist channels by first letter" className="-mx-5 mt-4 px-5 md:mx-0 md:px-0">
        <div className="shelf-scroll gap-1.5 pb-1 md:flex-wrap">
          {LETTERS.map(l => {
            const available = byLetter.has(l);
            const active = !q && letter === l;
            return (
              <button
                key={l}
                type="button"
                disabled={!available}
                aria-pressed={active}
                onClick={() => {
                  setLetter(l);
                  setQuery('');
                }}
                className={cn(
                  't-mono flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-bold uppercase transition-colors duration-200 motion-reduce:transition-none',
                  active && 'bg-[var(--cream)] text-[color:var(--ground)]',
                  !active && available && 'text-[color:var(--cream)] hover:bg-[var(--ground-3)]',
                  !available && 'cursor-default text-[color:var(--cream-dim)] opacity-35',
                )}
              >
                {l}
              </button>
            );
          })}
        </div>
      </nav>

      {shown.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
          {shown.map(a => {
            const f = floodFor(colours?.[a.cover]);
            return (
              <Link
                key={a.slug}
                to={`/tv/artist/${a.slug}`}
                className="flex min-h-[76px] flex-col justify-center gap-1 px-4 py-3 transition-transform hover:-translate-y-0.5"
                style={{ background: f.flood, color: f.ink }}
              >
                <span className="line-clamp-2 text-[15px] font-bold leading-tight">{a.name}</span>
                <span className="t-mono text-[11px] opacity-75">
                  {a.videos} video{a.videos === 1 ? '' : 's'}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="t-mono mt-6 text-[13px] text-[color:var(--cream-dim)]">No artist channels match “{query}”.</p>
      )}
    </section>
  );
}
