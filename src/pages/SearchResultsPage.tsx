import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Search, Disc, User, Music } from 'lucide-react';
import { filterGenres } from '@/lib/filterGenres';

interface Album {
  release_name: string;
  release_artist: string;
  genre_names: string[];
  uri_release: string;
  uri_artist: string;
  date_added: string;
  date_release_year: string;
  images_uri_release: {
    'hi-res': string;
    medium: string;
    small: string;
  };
  images_uri_artist: {
    'hi-res': string;
    medium: string;
    small: string;
  };
}

interface SearchResult {
  type: 'album' | 'artist';
  id: string;
  title: string;
  subtitle: string;
  image: string;
  url: string;
  year?: string;
  genres?: string[];
  albumCount?: number;
}

interface SearchResultsPageProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export function SearchResultsPage({ searchTerm, setSearchTerm }: SearchResultsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [collection, setCollection] = useState<Album[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  usePageTitle(query ? `Search: "${query}" | Russ.fm` : 'Search | Russ.fm');

  // Sync URL query with search term
  useEffect(() => {
    if (query && query !== searchTerm) {
      setSearchTerm(query);
    }
  }, [query, searchTerm, setSearchTerm]);

  useEffect(() => {
    loadCollection();
  }, []);

  useEffect(() => {
    if (collection.length > 0 && query) {
      performSearch(query);
    } else {
      setResults([]);
    }
  }, [collection, query]);

  const loadCollection = async () => {
    try {
      const response = await fetch('/collection.json');
      const data = await response.json();
      setCollection(data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading collection:', error);
      setLoading(false);
    }
  };

  const performSearch = (searchTerm: string) => {
    const searchLower = searchTerm.toLowerCase().trim();
    if (!searchLower) {
      setResults([]);
      return;
    }

    const albumResults: SearchResult[] = [];
    const artistResults: Map<string, SearchResult> = new Map();

    collection.forEach(album => {
      const albumMatches = 
        album.release_name.toLowerCase().includes(searchLower) ||
        album.release_artist.toLowerCase().includes(searchLower) ||
        album.genre_names.some(genre => genre.toLowerCase().includes(searchLower));

      if (albumMatches) {
        // Add album result
        albumResults.push({
          type: 'album',
          id: album.uri_release,
          title: album.release_name,
          subtitle: album.release_artist,
          image: album.images_uri_release.medium,
          url: album.uri_release,
          year: new Date(album.date_release_year).getFullYear().toString(),
          genres: filterGenres(album.genre_names, album.release_artist).slice(0, 3)
        });

        // Add/update artist result
        const artistKey = album.release_artist.toLowerCase();
        if (artistResults.has(artistKey)) {
          const existing = artistResults.get(artistKey)!;
          existing.albumCount = (existing.albumCount || 0) + 1;
        } else {
          artistResults.set(artistKey, {
            type: 'artist',
            id: album.uri_artist,
            title: album.release_artist,
            subtitle: `Artist in collection`,
            image: album.images_uri_artist.medium,
            url: album.uri_artist,
            albumCount: 1
          });
        }
      }
    });

    // Combine and sort results: artists first, then albums
    const sortedArtists = Array.from(artistResults.values())
      .sort((a, b) => a.title.localeCompare(b.title));
    
    const sortedAlbums = albumResults
      .sort((a, b) => a.title.localeCompare(b.title));

    setResults([...sortedArtists, ...sortedAlbums]);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading collection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4 flex items-center gap-3">
          <Search className="h-8 w-8" />
          Search Results
        </h1>
        
        {query && (
          <div className="text-lg text-muted-foreground mb-4">
            {results.length > 0 ? (
              <>
                Found <strong>{results.length}</strong> result{results.length !== 1 ? 's' : ''} for "<strong>{query}</strong>"
              </>
            ) : (
              <>No results found for "<strong>{query}</strong>"</>
            )}
          </div>
        )}
      </div>

      {!query && (
        <Card className="p-8 text-center">
          <CardContent>
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Start Searching</h3>
            <p className="text-muted-foreground">
              Use the search bar above to find albums, artists, or genres in the collection
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
                            <Badge key={genreIndex} variant="secondary" className="text-xs capitalize">
                              <Music className="h-3 w-3 mr-1" />
                              {genre}
                            </Badge>
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