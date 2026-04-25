import { Link } from 'react-router-dom';
import { Disc, User } from 'lucide-react';
import { GenreTag } from '@/components/ui/genre-tag';
import { EditorialEmpty, EditorialSkeleton } from '@/components/layout';
import { handleImageError } from '@/lib/image-utils';
import { cn } from '@/lib/utils';
import { SearchResult } from '@/services/searchService';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  isIndexing: boolean;
  error: string | null;
  searchTerm: string;
  onResultClick?: () => void;
  /** Kept for backwards-compat with overlay/modal callers. Editorial
   *  style is uniform now, but `compact` reduces the row padding and
   *  image size for overlay contexts. */
  layout?: 'grid' | 'list' | 'compact';
  showLimitMessage?: boolean;
  showViewAllLink?: boolean;
  className?: string;
}

/**
 * Editorial search result list. Results are segregated into album and
 * artist groups with mono kicker headers; each row is a hairline-
 * separated strip of `THUMB · TITLE · SUBTITLE · META`. Uniform style
 * across overlay, mobile modal, and results page — callers can opt
 * into `compact` sizing for the overlay drop-down.
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
  const compact = layout === 'compact';

  if (isLoading || isIndexing) {
    return (
      <EditorialSkeleton
        label={isIndexing ? 'Indexing collection…' : 'Searching…'}
        className={className}
      />
    );
  }

  if (error) {
    return (
      <EditorialEmpty title="Search error" detail={error} className={className} />
    );
  }

  if (searchTerm.trim() && results.length === 0) {
    return (
      <EditorialEmpty
        title="No results"
        detail="Try a different search term"
        className={className}
      />
    );
  }

  if (!searchTerm.trim()) {
    return (
      <EditorialEmpty
        title="Start typing to search"
        detail="Find albums, artists, and genres"
        className={className}
      />
    );
  }

  // Segregate into albums + artists
  const albums = results.filter(r => r.type === 'album');
  const artists = results.filter(r => r.type === 'artist');

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      {albums.length > 0 && (
        <ResultGroup
          kicker="Albums"
          count={albums.length}
          items={albums}
          compact={compact}
          onResultClick={onResultClick}
        />
      )}
      {artists.length > 0 && (
        <ResultGroup
          kicker="Artists"
          count={artists.length}
          items={artists}
          compact={compact}
          onResultClick={onResultClick}
        />
      )}

      {showLimitMessage && results.length >= 10 && (
        <p className="border-t border-rule pt-4 text-center font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dim">
          Showing first 10 · narrow the search for tighter matches
        </p>
      )}

      {showViewAllLink && searchTerm.trim() && results.length > 0 && (
        <div className="border-t border-rule pt-4 text-center">
          <Link
            to={`/search?q=${encodeURIComponent(searchTerm)}`}
            onClick={onResultClick}
            className="inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-hl transition-colors hover:underline"
          >
            View all results for "{searchTerm}" →
          </Link>
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  kicker,
  count,
  items,
  compact,
  onResultClick,
}: {
  kicker: string;
  count: number;
  items: SearchResult[];
  compact: boolean;
  onResultClick?: () => void;
}) {
  return (
    <section>
      <h3 className="mb-1 flex items-baseline justify-between border-b border-rule pb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        <span>{kicker}</span>
        <span>{String(count).padStart(3, '0')}</span>
      </h3>
      <ul>
        {items.map((result, index) => (
          <li key={`${result.type}-${result.id}-${index}`} className="border-b border-rule last:border-b-0">
            <Row result={result} compact={compact} onResultClick={onResultClick} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({
  result,
  compact,
  onResultClick,
}: {
  result: SearchResult;
  compact: boolean;
  onResultClick?: () => void;
}) {
  const isArtist = result.type === 'artist';
  const size = compact ? 'h-10 w-10' : 'h-14 w-14';
  const fallbackSrc =
    isArtist && result.title.toLowerCase() === 'various' ? '/images/various.png' : result.image;

  return (
    <Link
      to={result.url}
      onClick={onResultClick}
      className={cn(
        "grid items-center gap-4 px-0 transition-colors hover:bg-paper-2",
        compact ? "grid-cols-[40px_minmax(0,1fr)_auto] py-2" : "grid-cols-[56px_minmax(0,1fr)_auto] py-3",
      )}
    >
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden border border-rule-strong bg-paper-2 font-mono text-[11px] uppercase text-ink-dim",
          size,
          isArtist ? "rounded-[5px]" : "rounded-none",
        )}
      >
        <img
          src={fallbackSrc}
          onError={handleImageError}
          alt=""
          className="h-full w-full object-cover"
        />
        <span
          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-paper bg-ink text-paper"
          aria-hidden
        >
          {isArtist ? <User className="h-2.5 w-2.5" /> : <Disc className="h-2.5 w-2.5" />}
        </span>
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={cn("truncate font-grot font-semibold text-ink", compact ? "text-[13px]" : "text-[15px]")}>
            {result.title}
          </span>
          {result.year && (
            <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.04em] text-ink-dim">
              {result.year}
            </span>
          )}
        </div>
        <div className={cn("truncate font-mono uppercase tracking-[0.04em] text-ink-dim", compact ? "text-[10px]" : "text-[10.5px]")}>
          {result.subtitle}
          {result.albumCount ? (
            <>
              <span className="mx-1.5">·</span>
              {result.albumCount} REL
            </>
          ) : null}
        </div>
        {!compact && result.genres && result.genres.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {result.genres.slice(0, 2).map((genre) => (
              <GenreTag key={genre} genre={genre} size="sm" linkable />
            ))}
          </div>
        )}
      </div>

      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
        →
      </span>
    </Link>
  );
}
