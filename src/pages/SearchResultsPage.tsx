import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContainer } from '@/components/layout';
import { FloodBand, useRecordsFlood } from '@/components/player';
import { useCollection } from '@/lib/collection';
import { SearchResults } from '@/components/SearchResults';
import { useManualSearch } from '@/hooks/useSearch';
import { cn } from '@/lib/utils';

type TypeFilter = 'all' | 'album' | 'artist';

/**
 * Full search results page, deep-linked by `/search?q=...`: page title with
 * the result count, a search field, type filter pills, then the results as
 * record tiles and artist photos.
 */
export function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [draft, setDraft] = useState(query);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  usePageTitle(query ? `Search: "${query}" | Russ.fm` : 'Search | Russ.fm');

  const {
    query: searchQuery,
    setQuery,
    results,
    isLoading,
    isIndexing,
    error,
    isReady,
    search,
  } = useManualSearch();

  useEffect(() => {
    if (query && query !== searchQuery) {
      setQuery(query);
      if (isReady) search(query, { limit: 100 });
    }
  }, [query, searchQuery, setQuery, isReady, search]);

  useEffect(() => {
    if (isReady && query && !isLoading) {
      search(query, { limit: 100 });
    }
  }, [isReady, query, search, isLoading]);

  // Keep the field in step with the URL (nav search, back/forward).
  useEffect(() => {
    setDraft(query);
    setTypeFilter('all');
  }, [query]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = draft.trim();
    setSearchParams(next ? { q: next } : {});
  };

  const albumCount = results.filter(r => r.type === 'album').length;
  const artistCount = results.filter(r => r.type === 'artist').length;
  const visible = typeFilter === 'all' ? results : results.filter(r => r.type === typeFilter);
  const busy = isLoading || isIndexing;
  // The header band and page ground take the colours of the first album
  // results, or of the latest additions before anything has been searched.
  const { albums: collection } = useCollection();
  const leadUris = useMemo(() => {
    const hits = results.filter(r => r.type === 'album').map(r => r.url);
    if (hits.length) return hits;
    return [...collection].sort((a, b) => b.date_added.localeCompare(a.date_added)).slice(0, 3).map(a => a.uri_release);
  }, [results, collection]);
  const flood = useRecordsFlood(leadUris);

  const filters: Array<{ value: TypeFilter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: results.length },
    { value: 'album', label: 'Albums', count: albumCount },
    { value: 'artist', label: 'Artists', count: artistCount },
  ];

  return (
    <>
      <FloodBand flood={flood}>
        <header className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <h1 className="t-disp m-0 text-[44px] md:text-[72px] lg:text-[96px]">Search</h1>
          {query && !busy && (
            <span
              className="t-disp text-[28px] text-[color:var(--cream-dim)] md:text-[44px] lg:text-[56px]"
              aria-label={`${results.length} results`}
            >
              {results.length.toLocaleString('en-GB')}
            </span>
          )}
        </header>
      </FloodBand>

      <PageContainer className="text-[color:var(--cream)]">
        <div className="mb-10 flex flex-col gap-3 lg:flex-row lg:items-center">
          <form role="search" onSubmit={handleSubmit} className="min-w-0 lg:w-[420px]">
            <label className="flex h-12 min-w-0 items-center gap-3 rounded-full border-2 border-[color:var(--cream-rule)] bg-[var(--ground-2)] px-5 transition-colors focus-within:border-[color:var(--cream)]">
              <Search className="h-[18px] w-[18px] shrink-0 text-[color:var(--cream-dim)]" aria-hidden />
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                placeholder="Search the collection"
                aria-label="Search the collection"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="h-full w-full min-w-0 bg-transparent text-[15px] text-[color:var(--cream)] placeholder:text-[color:var(--cream-dim)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {draft && (
                <button
                  type="button"
                  onClick={() => setDraft('')}
                  aria-label="Clear search"
                  className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--cream-dim)] transition-colors hover:text-[color:var(--cream)]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </label>
          </form>

          {query && results.length > 0 && !busy && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter results">
              {filters.map(f => {
                const active = typeFilter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={active}
                    disabled={f.count === 0}
                    onClick={() => setTypeFilter(f.value)}
                    className={cn(
                      'pill px-4 text-[14px]',
                      active
                        ? 'pill-solid bg-[var(--cream)] text-[color:var(--ground)]'
                        : 'text-[color:var(--cream-dim)] hover:text-[color:var(--cream)]',
                      f.count === 0 && 'opacity-35',
                    )}
                  >
                    {f.label}
                    <span className="t-mono text-[12px] opacity-70">{f.count.toLocaleString('en-GB')}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <SearchResults
          results={visible}
          isLoading={isLoading}
          isIndexing={isIndexing}
          error={error}
          searchTerm={query}
          layout="grid"
          showLimitMessage={false}
          showViewAllLink={false}
        />
      </PageContainer>
    </>
  );
}
