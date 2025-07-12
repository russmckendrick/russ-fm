import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Disc, User, Music, X } from 'lucide-react';
import { filterGenres } from '@/lib/filterGenres';

interface Album {
  release_name: string;
  release_artist: string;
  artists?: Array<{
    name: string;
    uri_artist: string;
    json_detailed_artist: string;
    images_uri_artist: {
      'hi-res': string;
      medium: string;
    };
  }>;
  genre_names: string[];
  uri_release: string;
  uri_artist: string;
  date_added: string;
  date_release_year: string;
  images_uri_release: {
    'hi-res': string;
    medium: string;
  };
  images_uri_artist: {
    'hi-res': string;
    medium: string;
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

interface SearchOverlayProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isVisible: boolean;
  onClose: () => void;
}

export function SearchOverlay({ searchTerm, setSearchTerm, isVisible, onClose }: SearchOverlayProps) {
  const [collection, setCollection] = useState<Album[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCollection();
  }, []);

  useEffect(() => {
    if (collection.length > 0 && searchTerm.trim() && isVisible) {
      setLoading(true);
      const timeoutId = setTimeout(() => {
        performSearch(searchTerm);
        setLoading(false);
      }, 150);
      return () => clearTimeout(timeoutId);
    } else {
      setResults([]);
    }
  }, [collection, searchTerm, isVisible]);

  // Close overlay when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (overlayRef.current && !overlayRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible, onClose]);

  const loadCollection = async () => {
    try {
      const response = await fetch('/collection.json');
      const data = await response.json();
      setCollection(data);
    } catch (error) {
      console.error('Error loading collection:', error);
    }
  };

  const performSearch = (searchTermLocal: string) => {
    const searchLower = searchTermLocal.toLowerCase().trim();
    if (!searchLower) {
      setResults([]);
      return;
    }

    const albumResults: SearchResult[] = [];
    const artistResults: Map<string, SearchResult> = new Map();

    collection.forEach(album => {
      // Check if album name or genres match
      const albumNameMatches = 
        album.release_name.toLowerCase().includes(searchLower) ||
        album.genre_names.some(genre => genre.toLowerCase().includes(searchLower));
      
      // Check if any individual artist matches
      const artistMatches = album.release_artist.toLowerCase().includes(searchLower) ||
        (album.artists && album.artists.some(artist => artist.name.toLowerCase().includes(searchLower)));

      if (albumNameMatches || artistMatches) {
        // Add album result
        albumResults.push({
          type: 'album',
          id: album.uri_release,
          title: album.release_name,
          subtitle: album.artists && album.artists.length > 1 
            ? album.artists.map(artist => artist.name).join(' & ')
            : album.release_artist,
          image: album.images_uri_release.medium,
          url: album.uri_release,
          year: new Date(album.date_release_year).getFullYear().toString(),
          genres: filterGenres(album.genre_names, album.release_artist).slice(0, 3)
        });
      }

      // Process individual artists for artist results
      if (album.artists && album.artists.length > 0) {
        album.artists.forEach(artist => {
          // Skip "Various" artists
          if (artist.name.toLowerCase() === 'various') {
            return;
          }
          
          if (artist.name.toLowerCase().includes(searchLower)) {
            const artistKey = artist.name.toLowerCase();
            if (artistResults.has(artistKey)) {
              const existing = artistResults.get(artistKey)!;
              existing.albumCount = (existing.albumCount || 0) + 1;
            } else {
              artistResults.set(artistKey, {
                type: 'artist',
                id: artist.uri_artist,
                title: artist.name,
                subtitle: `Artist in collection`,
                image: artist.images_uri_artist.medium,
                url: artist.uri_artist,
                albumCount: 1
              });
            }
          }
        });
      } else {
        // Handle albums without artists array (backward compatibility)
        // Skip "Various" artists
        if (album.release_artist.toLowerCase() === 'various') {
          return;
        }
        
        if (album.release_artist.toLowerCase().includes(searchLower)) {
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
      }
    });

    // Combine and sort results: artists first, then albums, limit to 10 total
    const sortedArtists = Array.from(artistResults.values())
      .sort((a, b) => a.title.localeCompare(b.title));
    
    const sortedAlbums = albumResults
      .sort((a, b) => a.title.localeCompare(b.title));

    const combined = [...sortedArtists, ...sortedAlbums].slice(0, 10);
    setResults(combined);
  };

  const handleResultClick = () => {
    onClose();
    setSearchTerm('');
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/20" style={{ top: '112px' }}>
      <div className="container mx-auto px-4">
        <div ref={overlayRef} className="bg-background border rounded-lg shadow-2xl max-h-[calc(100vh-140px)] overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Search className="h-5 w-5 text-muted-foreground" />
                <span className="text-lg font-semibold">
                  {searchTerm.trim() ? (
                    <>
                      {results.length > 0 ? (
                        <>Found <strong>{results.length}</strong> result{results.length !== 1 ? 's' : ''} for "<strong>{searchTerm}</strong>"</>
                      ) : loading ? (
                        <>Searching for "<strong>{searchTerm}</strong>"...</>
                      ) : (
                        <>No results for "<strong>{searchTerm}</strong>"</>
                      )}
                    </>
                  ) : (
                    'Start typing to search...'
                  )}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-muted rounded-full transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-muted-foreground">Searching...</p>
              </div>
            )}

            {!loading && searchTerm.trim() && results.length === 0 && (
              <div className="p-8 text-center">
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No results found</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {results.map((result, index) => (
                    <Link 
                      key={`${result.type}-${result.id}-${index}`} 
                      to={result.url}
                      onClick={handleResultClick}
                      className="block"
                    >
                      <Card className="hover:shadow-md hover:scale-[1.02] transition-all duration-200 h-full">
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="relative flex-shrink-0">
                              {result.type === 'artist' ? (
                                <Avatar className="h-20 w-20">
                                  <AvatarImage 
                                    src={result.title.toLowerCase() === 'various' ? '/images/various.png' : result.image} 
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
                                    <Badge key={genreIndex} variant="secondary" className="text-xs capitalize px-1 py-0">
                                      {genre}
                                    </Badge>
                                  ))}
                                  {result.genres.length > 2 && (
                                    <Badge variant="outline" className="text-xs px-1 py-0">
                                      +{result.genres.length - 2}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
                
                {results.length >= 10 && (
                  <div className="mt-4 pt-3 border-t text-center">
                    <p className="text-xs text-muted-foreground">
                      Showing first 10 results. Try a more specific search term for better results.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}