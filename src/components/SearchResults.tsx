import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ArtistCard } from '@/components/ArtistCard';
import { RecordTile } from '@/components/player';
import { useAlbumColorMap, type AlbumColorPalette } from '@/hooks/useAlbumColors';
import { handleImageError } from '@/lib/image-utils';
import { floodFor } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import { SearchResult } from '@/services/searchService';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  isIndexing: boolean;
  error: string | null;
  searchTerm: string;
  onResultClick?: () => void;
  /**
   * - `grid`: record tiles and round artist photos (full results page)
   * - `list`: rows with sleeve thumbnails (mobile search)
   * - `compact`: tighter rows for the nav drop-down
   */
  layout?: 'grid' | 'list' | 'compact';
  showLimitMessage?: boolean;
  showViewAllLink?: boolean;
  className?: string;
}

/**
 * Search results grouped into Albums and Artists. Every sleeve carries its
 * own flood colour (colour bar on tiles, edge stripe on rows); artists borrow
 * the colour of their first matching record.
 */
export function SearchResults({
  results,
  isLoading,
  isIndexing,
  error,
  searchTerm,
  onResultClick,
  layout = 'grid',
  showLimitMessage = true,
  showViewAllLink = false,
  className = '',
}: SearchResultsProps) {
  const colorMap = useAlbumColorMap();
  const compact = layout === 'compact';

  if (isLoading || isIndexing) {
    return (
      <StatusPanel compact={compact} className={className} busy>
        <span className="t-mono text-[12px] uppercase text-[color:var(--cream-dim)]">
          {isIndexing ? 'Indexing collection…' : 'Searching…'}
        </span>
        <div className="mt-4 flex w-full flex-col gap-3" aria-hidden>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-md bg-[var(--ground-3)] motion-reduce:animate-none" />
              <div className="h-3 flex-1 animate-pulse rounded-full bg-[var(--ground-3)] motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </StatusPanel>
    );
  }

  if (error) {
    return (
      <StatusPanel compact={compact} className={className}>
        <p className="t-disp m-0 text-[22px]">Search error</p>
        <p className="t-mono mt-2 text-[12px] text-[color:var(--cream-dim)]">{error}</p>
      </StatusPanel>
    );
  }

  if (!searchTerm.trim()) {
    return (
      <StatusPanel compact={compact} className={className}>
        <p className="t-mono m-0 text-[12px] uppercase text-[color:var(--cream-dim)]">Start typing to search</p>
      </StatusPanel>
    );
  }

  if (results.length === 0) {
    return (
      <StatusPanel compact={compact} className={className}>
        <p className="t-disp m-0 text-[22px] md:text-[26px]">No results</p>
        <p className="t-mono mt-2 break-words text-[12px] text-[color:var(--cream-dim)]">“{searchTerm.trim()}”</p>
      </StatusPanel>
    );
  }

  const albums = results.filter(r => r.type === 'album');
  const artists = results.filter(r => r.type === 'artist');

  // An artist takes the colour of the first matching record they appear on.
  const artistPalette = (artist: SearchResult): AlbumColorPalette | null => {
    const name = artist.title.toLowerCase();
    const album = albums.find(a => a.subtitle.toLowerCase().includes(name));
    return album ? colorMap?.[album.url] ?? null : null;
  };

  return (
    <div className={cn('flex flex-col', compact ? 'gap-5' : 'gap-10', className)}>
      {albums.length > 0 && (
        <ResultGroup label="Albums" count={albums.length} layout={layout}>
          {layout === 'grid' ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 md:gap-x-6 lg:grid-cols-5 xl:grid-cols-6">
              {albums.map(result => (
                <div key={`album-${result.id}`} onClickCapture={onResultClick}>
                  <RecordTile
                    album={{ uri_release: result.url, release_name: result.title, release_artist: result.subtitle }}
                    palette={colorMap?.[result.url]}
                    meta={[result.year, result.genres?.[0]].filter(Boolean).join(' · ') || undefined}
                  />
                </div>
              ))}
            </div>
          ) : (
            <RowList>
              {albums.map(result => (
                <Row
                  key={`album-${result.id}`}
                  result={result}
                  palette={colorMap?.[result.url]}
                  compact={compact}
                  onResultClick={onResultClick}
                />
              ))}
            </RowList>
          )}
        </ResultGroup>
      )}

      {artists.length > 0 && (
        <ResultGroup label="Artists" count={artists.length} layout={layout}>
          {layout === 'grid' ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 md:gap-x-6 lg:grid-cols-5 xl:grid-cols-6">
              {artists.map(result => (
                <div key={`artist-${result.id}`} onClickCapture={onResultClick}>
                  <ArtistCard
                    artist={{
                      name: result.title,
                      uri: result.url,
                      albumCount: result.albumCount ?? 0,
                      image: artistImage(result),
                    }}
                    palette={artistPalette(result)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <RowList>
              {artists.map(result => (
                <Row
                  key={`artist-${result.id}`}
                  result={result}
                  palette={artistPalette(result)}
                  compact={compact}
                  onResultClick={onResultClick}
                />
              ))}
            </RowList>
          )}
        </ResultGroup>
      )}

      {showLimitMessage && results.length >= 10 && (
        <p className="t-mono m-0 text-center text-[11px] uppercase text-[color:var(--cream-dim)]">
          First {results.length} matches
        </p>
      )}

      {showViewAllLink && results.length > 0 && (
        <div className="flex justify-center">
          <Link
            to={`/search?q=${encodeURIComponent(searchTerm)}`}
            onClick={onResultClick}
            className="pill px-5 text-[14px] text-[color:var(--cream)]"
          >
            All results
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}

/** Artist image; the "Various" pseudo-artist has no photo of its own. */
function artistImage(result: SearchResult): string {
  return result.title.toLowerCase() === 'various' ? '/images/various.png' : result.image;
}

function StatusPanel({
  compact,
  busy,
  className,
  children,
}: {
  compact: boolean;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start rounded-2xl text-[color:var(--cream)]',
        compact ? 'px-2 py-3' : 'bg-[var(--ground-2)] px-6 py-8 md:px-8',
        className,
      )}
      aria-live="polite"
      aria-busy={busy || undefined}
    >
      {children}
    </div>
  );
}

function ResultGroup({
  label,
  count,
  layout,
  children,
}: {
  label: string;
  count: number;
  layout: 'grid' | 'list' | 'compact';
  children: ReactNode;
}) {
  const size =
    layout === 'grid' ? 'text-[30px] md:text-[40px]' : layout === 'list' ? 'text-[22px]' : 'text-[18px]';
  return (
    <section>
      <div className={cn('flex items-baseline gap-3', layout === 'grid' ? 'mb-6' : 'mb-3 px-2')}>
        <h2 className={cn('t-disp m-0', size)}>{label}</h2>
        <span className="t-mono text-[12px] text-[color:var(--cream-dim)]">{count.toLocaleString('en-GB')}</span>
      </div>
      {children}
    </section>
  );
}

function RowList({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-none flex-col gap-1 p-0">{children}</ul>;
}

function Row({
  result,
  palette,
  compact,
  onResultClick,
}: {
  result: SearchResult;
  palette?: AlbumColorPalette | null;
  compact: boolean;
  onResultClick?: () => void;
}) {
  const isArtist = result.type === 'artist';
  const { flood } = floodFor(palette);
  const src = isArtist ? artistImage(result) : result.image;
  const meta = isArtist
    ? result.albumCount
      ? `${result.albumCount} ${result.albumCount === 1 ? 'record' : 'records'}`
      : null
    : [result.year, ...(result.genres ?? []).slice(0, compact ? 1 : 2)].filter(Boolean).join(' · ');

  return (
    <li>
      <Link
        to={result.url}
        onClick={onResultClick}
        className={cn(
          'group flex min-h-[44px] items-center gap-3 rounded-xl px-2 text-[color:var(--cream)] transition-colors duration-200 hover:bg-[var(--ground-3)] focus-visible:bg-[var(--ground-3)] focus-visible:outline-none motion-reduce:transition-none',
          compact ? 'py-1.5' : 'py-2',
        )}
      >
        <span
          className={cn(
            'relative shrink-0 overflow-hidden bg-[var(--ground-3)]',
            compact ? 'h-11 w-11' : 'h-14 w-14',
            isArtist ? 'rounded-full' : 'rounded-[3px] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.7)]',
          )}
          style={isArtist ? { boxShadow: `0 0 0 2px var(--ground-2), 0 0 0 4px ${flood}` } : undefined}
        >
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={handleImageError}
            className="h-full w-full object-cover"
          />
        </span>
        {!isArtist && <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: flood }} aria-hidden />}

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn('truncate font-bold leading-snug', compact ? 'text-[14px]' : 'text-[15px]')}>
            {result.title}
          </span>
          {!isArtist && (
            <span className={cn('truncate text-[color:var(--cream-dim)]', compact ? 'text-[13px]' : 'text-[14px]')}>
              {result.subtitle}
            </span>
          )}
          {meta && (
            <span className="t-mono truncate text-[11px] uppercase text-[color:var(--cream-dim)]">{meta}</span>
          )}
        </span>

        <ArrowRight
          className="h-4 w-4 shrink-0 text-[color:var(--cream-dim)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
          aria-hidden
        />
      </Link>
    </li>
  );
}
