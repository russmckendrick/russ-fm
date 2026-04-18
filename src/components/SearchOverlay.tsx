import { useEffect, useRef, RefObject } from 'react';
import { Link } from 'react-router-dom';
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
      className="absolute right-0 top-full z-40 w-[min(640px,calc(100vw-40px))] border-x border-b border-rule-strong bg-paper shadow-[0_30px_60px_-20px_rgba(14,13,11,0.35)]"
    >
      {/* Status strip ------------------------------------------------ */}
      <div className="flex items-center justify-between border-b border-rule bg-paper-2/60 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dim">
        <span>{status}</span>
        <div className="flex items-center gap-3">
          {trimmed && results.length > 0 && (
            <Link
              to={`/search?q=${encodeURIComponent(searchTerm)}`}
              onClick={handleResultClick}
              className="text-hl transition-colors hover:underline"
            >
              View all →
            </Link>
          )}
          <span className="flex items-center gap-1">
            <kbd className="border border-rule-strong bg-paper px-1.5 py-0.5">Esc</kbd>
          </span>
        </div>
      </div>

      {/* Results ----------------------------------------------------- */}
      <div className="max-h-[min(560px,calc(100vh-160px))] overflow-y-auto px-4 py-3">
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
