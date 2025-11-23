import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { GenreTag } from '@/components/ui/genre-tag';
import { Search, Disc, User, AlertCircle } from 'lucide-react';
import { handleImageError } from '@/lib/image-utils';
import { SearchResult } from '@/services/searchService';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  isIndexing: boolean;
  error: string | null;
  searchTerm: string;
  onResultClick?: () => void;
  layout?: 'grid' | 'list';
  showLimitMessage?: boolean;
  showViewAllLink?: boolean;
  className?: string;
}

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
  className = ''
}: SearchResultsProps) {
  // Loading state
  if (isLoading || isIndexing) {
    return (
      <div className={`p-8 text-center ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
        <p className="text-muted-foreground">
          {isIndexing ? 'Indexing collection...' : 'Searching...'}
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`p-8 text-center ${className}`}>
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-500 font-medium">Search Error</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
      </div>
    );
  }

  // Empty state
  if (searchTerm.trim() && results.length === 0) {
    return (
      <div className={`p-8 text-center ${className}`}>
        <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">No results found</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Try a different search term</p>
      </div>
    );
  }

  // No search term
  if (!searchTerm.trim()) {
    return (
      <div className={`p-8 text-center ${className}`}>
        <Search className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium text-muted-foreground">
          Start typing to search
        </p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Find albums, artists, and genres
        </p>
      </div>
    );
  }

  // Results
  if (layout === 'list') {
    return (
      <div className={`space-y-3 ${className}`}>
        {results.map((result, index) => (
          <Link
            key={`${result.type}-${result.id}-${index}`}
            to={result.url}
            onClick={onResultClick}
            className="block min-h-[44px]"
          >
            <Card className="hover:shadow-md hover:scale-[1.01] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="relative flex-shrink-0">
                    {result.type === 'artist' ? (
                      <Avatar className="h-12 w-12">
                        <AvatarImage
                          src={result.title.toLowerCase() === 'various' ? '/images/various.png' : result.image}
                          onError={handleImageError}
                          alt={result.title}
                        />
                        <AvatarFallback className="text-sm">
                          {result.title.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="h-12 w-12 rounded-md overflow-hidden">
                        <img
                          src={result.image}
                          onError={handleImageError}
                          alt={result.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Type indicator */}
                    <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                      {result.type === 'artist' ? (
                        <User className="h-2 w-2" />
                      ) : (
                        <Disc className="h-2 w-2" />
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm truncate flex-1">
                        {result.title}
                      </h3>
                      {result.year && (
                        <Badge variant="outline" className="text-xs px-1 py-0">
                          {result.year}
                        </Badge>
                      )}
                      {result.albumCount && (
                        <Badge variant="secondary" className="text-xs">
                          {result.albumCount} album{result.albumCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mb-2 truncate">
                      {result.subtitle}
                    </p>

                    {result.genres && result.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.genres.slice(0, 2).map((genre, genreIndex) => (
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

        {/* Limit message and view all link */}
        {showLimitMessage && results.length >= 10 && (
          <div className="mt-4 pt-3 border-t text-center">
            <p className="text-xs text-muted-foreground">
              Showing first 10 results. Try a more specific search term for better results.
            </p>
          </div>
        )}

        {showViewAllLink && searchTerm.trim() && results.length > 0 && (
          <div className="mt-4 pt-3 border-t text-center">
            <Link
              to={`/search?q=${encodeURIComponent(searchTerm)}`}
              onClick={onResultClick}
              className="text-xs text-primary hover:underline"
            >
              View all results for "{searchTerm}"
            </Link>
          </div>
        )}
      </div>
    );
  }

  // Grid layout (default)
  return (
    <div className={className}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((result, index) => (
          <Link
            key={`${result.type}-${result.id}-${index}`}
            to={result.url}
            onClick={onResultClick}
            className="block min-h-[44px]"
          >
            <Card className="hover:shadow-md hover:scale-[1.02] transition-all duration-200 h-full">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    {result.type === 'artist' ? (
                      <Avatar className="h-20 w-20">
                        <AvatarImage
                          src={result.title.toLowerCase() === 'various' ? '/images/various.png' : result.image}
                          onError={handleImageError}
                          alt={result.title}
                        />
                        <AvatarFallback className="text-lg">
                          {result.title.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="h-20 w-20 rounded-md overflow-hidden">
                        <img
                          src={result.image}
                          onError={handleImageError}
                          alt={result.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Type indicator */}
                    <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                      {result.type === 'artist' ? (
                        <User className="h-2 w-2" />
                      ) : (
                        <Disc className="h-2 w-2" />
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-1">
                      <h3 className="font-medium text-sm truncate flex-1">
                        {result.title}
                      </h3>
                      {result.year && (
                        <Badge variant="outline" className="text-xs px-1 py-0">
                          {result.year}
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mb-2 truncate">
                      {result.subtitle}
                    </p>

                    {result.albumCount && (
                      <Badge variant="secondary" className="text-xs mb-2">
                        {result.albumCount} album{result.albumCount !== 1 ? 's' : ''}
                      </Badge>
                    )}

                    {result.genres && result.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.genres.slice(0, 2).map((genre, genreIndex) => (
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

      {/* Limit message and view all link */}
      {showLimitMessage && results.length >= 10 && (
        <div className="mt-4 pt-3 border-t text-center">
          <p className="text-xs text-muted-foreground">
            Showing first 10 results. Try a more specific search term for better results.
          </p>
        </div>
      )}

      {showViewAllLink && searchTerm.trim() && results.length > 0 && (
        <div className="mt-4 pt-3 border-t text-center">
          <Link
            to={`/search?q=${encodeURIComponent(searchTerm)}`}
            onClick={onResultClick}
            className="text-xs text-primary hover:underline"
          >
            View all results for "{searchTerm}"
          </Link>
        </div>
      )}
    </div>
  );
}