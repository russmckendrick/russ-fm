import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContainer } from '@/components/layout';
import { BrowseHeader } from '@/components/browse/BrowseHeader';
import { SearchResults } from '@/components/SearchResults';
import { useManualSearch } from '@/hooks/useSearch';

/**
 * Full search results page, deep-linked by `/search?q=...`. Renders the
 * editorial `BrowseHeader` with a mono count strip and the shared
 * `SearchResults` list in full-width mode.
 */
export function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

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

  const headerCounts = (() => {
    const counts: Array<{ label: string; value: string | number }> = [];
    if (query) counts.push({ label: 'Query', value: `"${query}"` });
    if (results.length) {
      counts.push({ label: 'Results', value: results.length });
      const albumCount = results.filter(r => r.type === 'album').length;
      const artistCount = results.filter(r => r.type === 'artist').length;
      if (albumCount) counts.push({ label: 'Albums', value: albumCount });
      if (artistCount) counts.push({ label: 'Artists', value: artistCount });
    }
    return counts;
  })();

  return (
    <PageContainer>
      <BrowseHeader
        num="00"
        kicker="Catalogue · Search"
        title={query ? `Results for "${query}"` : 'Search the catalogue'}
        subtitle={
          query
            ? 'Full matches across the collection. Tap a row to open the record or artist.'
            : 'Use the nav search bar (or press / from any page) to find albums, artists, and genres across the collection.'
        }
        counts={headerCounts.length ? headerCounts : undefined}
      />

      <SearchResults
        results={results}
        isLoading={isLoading}
        isIndexing={isIndexing}
        error={error}
        searchTerm={query}
        layout="list"
        showLimitMessage={false}
        showViewAllLink={false}
      />
    </PageContainer>
  );
}
