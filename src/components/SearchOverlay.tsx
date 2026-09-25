import { useEffect, useRef, RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useInstantSearch } from '@/hooks/useSearch';
import { SearchResults } from './SearchResults';

interface SearchOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  /** Optional ref to the nav input. Clicks on the input itself should
   *  not count as outside-clicks (they'd re-open the overlay immediately).
   */
  anchorRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Compact dropdown anchored under the nav search input. Right-aligned
 * to the input's right edge, same width by default but growing to a
 * comfortable reading width on larger viewports. The input itself lives
 * in the nav — this overlay only renders the status strip and result
 * list so the two feel like one continuous control.
 */
export function SearchOverlay({
  isVisible,
  onClose,
  searchTerm,
  setSearchTerm,
  anchorRef,
}: SearchOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { setQuery, results, isLoading, isIndexing, error } = useInstantSearch();

  useEffect(() => {
    setQuery(searchTerm);
  }, [searchTerm, setQuery]);

  useEffect(() => {
    if (!isVisible) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (overlayRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible, onClose, anchorRef]);

  useEffect(() => {
    if (!isVisible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isVisible, onClose]);

  const handleResultClick = () => {
    setSearchTerm('');
    onClose();
  };

  if (!isVisible) return null;

  const trimmed = searchTerm.trim();
  const status = (() => {
    if (!trimmed) return isIndexing ? 'Preparing index…' : 'Start typing to search';
    if (error) return `Error · ${error}`;
    if (isIndexing) return 'Indexing collection…';
    if (isLoading) return 'Searching…';
    if (results.length === 0) return 'No matches';
    return `${results.length} match${results.length === 1 ? '' : 'es'}`;
  })();

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-label="Search results"
      className="absolute right-0 top-full z-40 mt-3 w-[min(640px,calc(100vw-40px))] overflow-hidden rounded-2xl border border-[color:var(--cream-rule)] bg-[var(--ground-2)] text-[color:var(--cream)] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.75)]"
    >
      {/* Status strip ------------------------------------------------ */}
      <div className="flex min-h-[48px] items-center justify-between gap-3 border-b border-[color:var(--cream-rule)] px-5 py-2">
        <span className="t-mono truncate text-[11px] uppercase text-[color:var(--cream-dim)]" aria-live="polite">
          {status}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          {trimmed && results.length > 0 && (
            <Link
              to={`/search?q=${encodeURIComponent(searchTerm)}`}
              onClick={handleResultClick}
              className="pill px-4 text-[13px] border-[color:var(--cream-rule)] text-[color:var(--cream)] hover:border-[color:var(--cream)]"
            >
              All results
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
          <kbd className="t-mono rounded border border-[color:var(--cream-rule)] px-1.5 py-0.5 text-[11px] text-[color:var(--cream-dim)]">
            Esc
          </kbd>
        </div>
      </div>

      {/* Results ----------------------------------------------------- */}
      <div className="max-h-[min(560px,calc(100vh-160px))] overflow-y-auto overscroll-contain px-3 py-4">
        <SearchResults
          results={results}
          isLoading={isLoading}
          isIndexing={isIndexing}
          error={error}
          searchTerm={searchTerm}
          onResultClick={handleResultClick}
          layout="compact"
          showLimitMessage={false}
          showViewAllLink={false}
        />
      </div>
    </div>
  );
}
