import { useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { GenreTag } from '@/components/ui/genre-tag';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Search, Disc, User, Music, AlertCircle } from 'lucide-react';
import { useManualSearch } from '@/hooks/useSearch';


export function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  usePageTitle(query ? `Search: "${query}" | Russ.fm` : 'Search | Russ.fm');

  // Use manual search hook for full page search
  const { 
    query: searchQuery,
    setQuery,
    results, 
    isLoading, 
    isIndexing, 
    error,
    isReady,
    search
  } = useManualSearch();

  // Sync URL query with search and perform search
  useEffect(() => {
    if (query && query !== searchQuery) {
      setQuery(query);
      if (isReady) {
        search(query, { limit: 100 }); // More results for full page
      }
    }
  }, [query, searchQuery, setQuery, isReady, search]);

  // Perform search when service becomes ready
  useEffect(() => {
    if (isReady && query && !isLoading) {
      search(query, { limit: 100 });
    }
  }, [isReady, query, search, isLoading]);

  if (isIndexing) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Preparing search index...</p>
          <p className="text-xs text-muted-foreground/70 mt-2">This will only take a moment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4 flex items-center gap-3 text-foreground">
          <Search className="h-8 w-8" />
          Search Results
        </h1>
        
        {query && (
          <div className="text-lg text-muted-foreground mb-4">
            {error ? (
              <div className="flex items-center gap-2 text-red-500">
                <AlertCircle className="h-5 w-5" />
                Search error: {error}
              </div>
            ) : isLoading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                Searching for "<strong>{query}</strong>"...
              </div>
            ) : results.length > 0 ? (
              <>
                Found <strong>{results.length}</strong> result{results.length !== 1 ? 's' : ''} for "<strong>{query}</strong>"
              </>
            ) : (
              <>No results found for "<strong>{query}</strong>"</>
            )}
          </div>
        )}
      </div>

      {!query && !error && (
        <Card className="p-8 text-center">
          <CardContent>
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Start Searching</h3>
            <p className="text-muted-foreground">
              Use the search bar above to find albums, artists, or genres in the collection
            </p>
            {!isReady && (
              <p className="text-xs text-muted-foreground/70 mt-2">
                Search index is being prepared...
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {error && !query && (
        <Card className="p-8 text-center">
          <CardContent>
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2 text-red-500">Search Error</h3>
            <p className="text-muted-foreground">
              {error}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-2">
              Please try refreshing the page
            </p>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          {results.map((result, index) => (
            <Link key={`${result.type}-${result.id}-${index}`} to={result.url}>
              <Card className="hover:shadow-lg transition-all duration-300 hover:scale-[1.02]">
                <CardContent className="p-6">
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      {result.type === 'artist' ? (
                        <Avatar className="h-16 w-16">
                          <AvatarImage src={result.image} alt={result.title} />
                          <AvatarFallback className="text-lg">
                            {result.title.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <div className="h-16 w-16 rounded-lg overflow-hidden">
                          <img
                            src={result.image}
                            alt={result.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      
                      {/* Type indicator */}
                      <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full p-1">
                        {result.type === 'artist' ? (
                          <User className="h-3 w-3" />
                        ) : (
                          <Disc className="h-3 w-3" />
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold truncate">
                          {result.title}
                        </h3>
                        {result.year && (
                          <Badge variant="outline" className="text-sm">
                            {result.year}
                          </Badge>
                        )}
                        {result.albumCount && (
                          <Badge variant="secondary" className="text-sm">
                            {result.albumCount} album{result.albumCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-muted-foreground mb-3 truncate">
                        {result.subtitle}
                      </p>
                      
                      {result.genres && result.genres.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {result.genres.map((genre, genreIndex) => (
                            <GenreTag key={genreIndex} genre={genre} size="sm" linkable={true} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}