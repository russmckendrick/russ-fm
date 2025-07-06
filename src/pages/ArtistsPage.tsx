import { useState, useEffect } from 'react';
import { Users, Music } from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { appConfig } from '@/config/app.config';

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
      small: string;
    };
  }>;
  genre_names: string[];
  uri_release: string;
  uri_artist: string;
  date_added: string;
  date_release_year: string;
  images_uri_release: {
    medium: string;
  };
  images_uri_artist: {
    medium: string;
  };
}

interface Artist {
  name: string;
  uri: string;
  albums: Album[];
  albumCount: number;
  genres: string[];
  image: string;
  latestAlbum: string;
}

interface ArtistsPageProps {
  searchTerm: string;
}

export function ArtistsPage({ searchTerm }: ArtistsPageProps) {
  const { page } = useParams<{ page?: string }>();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');
  const [selectedLetter, setSelectedLetter] = useState('all');
  const [prevSearchTerm, setPrevSearchTerm] = useState(searchTerm);
  
  const itemsPerPage = appConfig.pagination.itemsPerPage.artists;
  const currentPage = page ? parseInt(page, 10) : 1;

  // Generate dynamic page title
  const getPageTitle = () => {
    const parts = ['Artists'];
    
    const sortLabels: Record<string, string> = {
      'name': 'A-Z',
      'albums': 'Most Albums',
      'latest': 'Recently Added'
    };
    
    if (sortBy !== 'name') {
      parts.push(`Sorted by ${sortLabels[sortBy]}`);  
    }
    
    if (searchTerm) {
      parts.push(`Search: "${searchTerm}"`);
    }
    
    if (currentPage > 1) {
      parts.push(`Page ${currentPage}`);
    }
    
    parts.push('Russ.fm');
    return parts.join(' | ');
  };
  
  usePageTitle(getPageTitle());

  useEffect(() => {
    loadCollection();
  }, []);

  useEffect(() => {
    if (collection.length > 0) {
      processArtists();
    }
  }, [collection]);

  useEffect(() => {
    filterAndSortArtists();
    
    // Only navigate to page 1 if search term actually changed
    if (searchTerm !== prevSearchTerm) {
      setPrevSearchTerm(searchTerm);
      if (currentPage !== 1) {
        navigate('/artists/1');
      }
    }
  }, [artists, searchTerm, sortBy, selectedLetter]);


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

  const processArtists = () => {
    const artistMap = new Map<string, Artist>();

    collection.forEach(album => {
      // Handle albums with multiple artists
      if (album.artists && album.artists.length > 0) {
        // Process each individual artist
        album.artists.forEach(artistInfo => {
          const artistName = artistInfo.name;
          
          // Skip "Various" artists
          if (artistName.toLowerCase() === 'various') {
            return;
          }
          
          if (!artistMap.has(artistName)) {
            artistMap.set(artistName, {
              name: artistName,
              uri: artistInfo.uri_artist,
              albums: [],
              albumCount: 0,
              genres: [],
              image: artistInfo.images_uri_artist.medium,
              latestAlbum: album.date_added
            });
          }

          const artist = artistMap.get(artistName)!;
          artist.albums.push(album);
          artist.albumCount++;
          
          // Add unique genres
          album.genre_names.forEach(genre => {
            if (!artist.genres.includes(genre)) {
              artist.genres.push(genre);
            }
          });

          // Update latest album if this one is newer
          if (album.date_added > artist.latestAlbum) {
            artist.latestAlbum = album.date_added;
            artist.image = artistInfo.images_uri_artist.medium;
          }
        });
      } else {
        // Fallback to original artist field for backward compatibility
        const artistName = album.release_artist;
        
        // Skip "Various" artists
        if (artistName.toLowerCase() === 'various') {
          return;
        }
        
        if (!artistMap.has(artistName)) {
          artistMap.set(artistName, {
            name: artistName,
            uri: album.uri_artist,
            albums: [],
            albumCount: 0,
            genres: [],
            image: album.images_uri_artist.medium,
            latestAlbum: album.date_added
          });
        }

        const artist = artistMap.get(artistName)!;
        artist.albums.push(album);
        artist.albumCount++;
        
        // Add unique genres
        album.genre_names.forEach(genre => {
          if (!artist.genres.includes(genre)) {
            artist.genres.push(genre);
          }
        });

        // Update latest album if this one is newer
        if (album.date_added > artist.latestAlbum) {
          artist.latestAlbum = album.date_added;
          artist.image = album.images_uri_artist.medium;
        }
      }
    });

    setArtists(Array.from(artistMap.values()));
  };

  const filterAndSortArtists = () => {
    let filtered = [...artists];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(artist =>
        artist.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        artist.genres.some(genre => genre.toLowerCase().includes(searchTerm.toLowerCase())) ||
        artist.albums.some(album => album.release_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Apply letter filter
    if (selectedLetter && selectedLetter !== 'all') {
      filtered = filtered.filter(artist =>
        artist.name.toLowerCase().startsWith(selectedLetter.toLowerCase())
      );
    }

    // Sort artists
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'albums':
          return b.albumCount - a.albumCount;
        case 'latest':
          return new Date(b.latestAlbum).getTime() - new Date(a.latestAlbum).getTime();
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    setFilteredArtists(filtered);
  };

  // Get available letters from artist names
  const getAvailableLetters = () => {
    const letters = new Set<string>();
    artists.forEach(artist => {
      const firstLetter = artist.name.charAt(0).toUpperCase();
      if (firstLetter.match(/[A-Z]/)) {
        letters.add(firstLetter);
      }
    });
    return Array.from(letters).sort();
  };

  // Get all letters A-Z
  const getAllLetters = () => {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredArtists.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedArtists = filteredArtists.slice(startIndex, endIndex);

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = [];
    const showPages = appConfig.pagination.showPageNumbers;
    
    if (totalPages <= showPages + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      let start = Math.max(2, currentPage - Math.floor(showPages / 2));
      let end = Math.min(totalPages - 1, start + showPages - 1);
      
      if (end === totalPages - 1) {
        start = Math.max(2, end - showPages + 1);
      }
      
      if (start > 2) pages.push('...');
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < totalPages - 1) pages.push('...');
      
      if (totalPages > 1) pages.push(totalPages);
    }
    
    return pages;
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading artists...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 p-4 bg-background/50 backdrop-blur-sm border rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Sort:</span>
          <Select value={sortBy} onValueChange={(value) => {
            setSortBy(value);
            if (currentPage !== 1) navigate('/artists/1');
          }}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Artist Name</SelectItem>
              <SelectItem value="albums">Album Count</SelectItem>
              <SelectItem value="latest">Latest Addition</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Letter Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Filter:</span>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => {
                setSelectedLetter('all');
                if (currentPage !== 1) navigate('/artists/1');
              }}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                selectedLetter === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            {getAllLetters().map((letter) => {
              const isAvailable = getAvailableLetters().includes(letter);
              const isSelected = selectedLetter === letter;
              
              return (
                <button
                  key={letter}
                  onClick={() => {
                    if (isAvailable) {
                      setSelectedLetter(letter);
                      if (currentPage !== 1) navigate('/artists/1');
                    }
                  }}
                  disabled={!isAvailable}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : isAvailable
                      ? 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer'
                      : 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Artists Grid */}
      {filteredArtists.length === 0 ? (
        <Card className="p-8 text-center">
          <CardContent>
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No artists found</h3>
            <p className="text-muted-foreground">Try adjusting your search</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {paginatedArtists.map((artist) => (
            <Link key={artist.uri} to={artist.uri} className="h-full">
              <Card className="cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg overflow-hidden group h-full flex flex-col">
                <div className="aspect-square relative overflow-hidden">
                  <img
                    src={artist.image}
                    alt={artist.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    loading="lazy"
                  />
                </div>
                <CardContent className="p-4 flex-1 flex flex-col">
                  <h3 className="font-semibold text-lg leading-tight mb-2 line-clamp-2">
                    {artist.name}
                  </h3>
                  <div className="flex items-center gap-2 text-muted-foreground mb-3">
                    <Music className="h-4 w-4" />
                    <span className="text-sm">
                      {artist.albumCount} album{artist.albumCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-auto">
                    {artist.genres.slice(0, 3).map((genre, index) => (
                      <Badge 
                        key={index} 
                        variant="secondary" 
                        className="text-xs capitalize"
                      >
                        {genre.toLowerCase()}
                      </Badge>
                    ))}
                    {artist.genres.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{artist.genres.length - 3}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => navigate(`/artists/${Math.max(1, currentPage - 1)}`)}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              
              {getPageNumbers().map((page, index) => (
                <PaginationItem key={index}>
                  {page === '...' ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      onClick={() => navigate(`/artists/${page}`)}
                      isActive={currentPage === page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              
              <PaginationItem>
                <PaginationNext 
                  onClick={() => navigate(`/artists/${Math.min(totalPages, currentPage + 1)}`)}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}