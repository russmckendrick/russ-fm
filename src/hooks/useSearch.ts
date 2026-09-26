import { useState, useEffect, useRef, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { searchService, SearchResult, SearchOptions, type Album as SearchAlbum } from '@/services/searchService';
import { loadCollection } from '@/lib/collection';

export interface UseSearchOptions {
  debounceMs?: number;
  limit?: number;
  threshold?: number;
  includeMatches?: boolean;
  filterByType?: 'album' | 'artist';
  autoSearch?: boolean; // Whether to search automatically on query change
  enabled?: boolean; // Build the index only once search is actually used
}

export interface UseSearchReturn {
  // State
  query: string;
  results: SearchResult[];
  isLoading: boolean;
  isIndexing: boolean;
  error: string | null;
  
  // Actions
  setQuery: (query: string) => void;
  search: (query?: string, options?: SearchOptions) => SearchResult[];
  clearResults: () => void;
  clearError: () => void;
  
  // Service info
  isReady: boolean;
  stats: ReturnType<typeof searchService.getStats>;
}

export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const {
    debounceMs = 150,
    limit = 20,
    threshold,
    includeMatches = false,
    filterByType,
    autoSearch = true,
    enabled = true
  } = options;

  // State
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isIndexing, setIsIndexing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Debounced query for automatic search
  const [debouncedQuery] = useDebounce(query, debounceMs);

  // Refs
  const searchOptionsRef = useRef<SearchOptions>({
    limit,
    threshold,
    includeMatches,
    filterByType
  });

  // Update search options when props change
  useEffect(() => {
    searchOptionsRef.current = {
      limit,
      threshold,
      includeMatches,
      filterByType
    };
  }, [limit, threshold, includeMatches, filterByType]);

  // Initialize search service
  useEffect(() => {
    if (!enabled) return;
    let isMounted = true;

    const initializeSearch = async () => {
      try {
        setIsIndexing(true);
        setError(null);

        // Check if already initialized
        if (searchService.isReady()) {
          setIsIndexing(false);
          setIsReady(true);
          return;
        }

        // Shared, cached collection (see src/lib/collection.ts)
        const collection = await loadCollection();
        
        // Initialize the search service
        await searchService.initialize(collection as unknown as SearchAlbum[]);

        if (isMounted) {
          setIsIndexing(false);
          setIsReady(true);
        }
      } catch (err) {
        console.error('Failed to initialize search:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize search');
          setIsIndexing(false);
          setIsReady(false);
        }
      }
    };

    initializeSearch();

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  // Perform search function
  const search = useCallback((searchQuery?: string, searchOptions?: SearchOptions): SearchResult[] => {
    const queryToUse = searchQuery ?? query;
    const optionsToUse = { ...searchOptionsRef.current, ...searchOptions };

    if (!queryToUse.trim() || !isReady) {
      setResults([]);
      return [];
    }

    try {
      setError(null);
      const searchResults = searchService.search(queryToUse, optionsToUse);
      setResults(searchResults);
      return searchResults;
    } catch (err) {
      console.error('Search failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Search failed';
      setError(errorMessage);
      setResults([]);
      return [];
    }
  }, [query, isReady]);

  // Auto search when debounced query changes
  useEffect(() => {
    if (autoSearch && isReady && !isIndexing) {
      if (debouncedQuery.trim()) {
        setIsLoading(true);
        
        // Perform search directly - requestAnimationFrame was causing focus issues
        search(debouncedQuery);
        setIsLoading(false);
      } else {
        setResults([]);
        setIsLoading(false);
      }
    }
  }, [debouncedQuery, autoSearch, isReady, isIndexing, search]);

  // Clear results
  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Get service stats
  const stats = searchService.getStats();

  return {
    // State
    query,
    results,
    isLoading: isLoading || isIndexing,
    isIndexing,
    error,
    
    // Actions
    setQuery,
    search,
    clearResults,
    clearError,
    
    // Service info
    isReady,
    stats
  };
}

// Specialized hooks for common use cases
export function useInstantSearch(initialQuery = '', enabled = true) {
  const search = useSearch({
    debounceMs: 100, // Faster for instant search
    limit: 10,
    autoSearch: true,
    enabled
  });

  useEffect(() => {
    if (initialQuery) {
      search.setQuery(initialQuery);
    }
  }, [initialQuery]);

  return search;
}

// Mobile-optimized search with minimal interference
export function useMobileSearch(enabled = true) {
  return useSearch({
    debounceMs: 200, // Slightly longer to reduce interference
    limit: 15,
    autoSearch: true,
    enabled
  });
}

export function useManualSearch() {
  return useSearch({
    autoSearch: false, // No automatic searching
    limit: 50
  });
}

export function useTypeAheadSearch() {
  return useSearch({
    debounceMs: 50, // Very fast for typeahead
    limit: 5,
    autoSearch: true
  });
}