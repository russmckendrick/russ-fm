import { useState, useEffect, useCallback } from 'react';
import { Users, Search, X } from 'lucide-react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ArtistCard } from '@/components/ArtistCard';
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
import { getArtistImageFromData } from '@/lib/image-utils';

interface Album {
  release_name: string;
  release_artist: string;
  artists?: Array<{
    name: string;
    uri_artist: string;
    json_detailed_artist: string;
    biography?: string;
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
  biography?: string;
}

export function ArtistsPage() {
  const { page } = useParams<{ page?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [collection, setCollection] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'name');
  const [selectedLetter, setSelectedLetter] = useState(searchParams.get('letter') || 'all');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  
  const itemsPerPage = appConfig.pagination.itemsPerPage.artists;
  const currentPage = page ? parseInt(page, 10) : 1;

  // Build navigation URL with current query params
  const buildPageUrl = (pageNum: number) => {
    const queryString = searchParams.toString();
    return queryString ? `/artists/${pageNum}?${queryString}` : `/artists/${pageNum}`;
  };

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

  const normalizeArtistName = (name: string): string => {
    // Normalize artist names for deduplication
    return name
      .toLowerCase()
      .trim()
      // Normalize common variations
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\bvan\b/g, 'van') // Normalize "Van" to "van"
      .replace(/\bde\b/g, 'de') // Normalize "De" to "de"
      .replace(/\bdel\b/g, 'del') // Normalize "Del" to "del"
      .replace(/\bla\b/g, 'la') // Normalize "La" to "la"
      .replace(/\ble\b/g, 'le') // Normalize "Le" to "le"
      .replace(/\bmac\b/g, 'mac') // Normalize "Mac" to "mac"
      .replace(/\bmc\b/g, 'mc') // Normalize "Mc" to "mc"
      .replace(/['']/g, "'") // Normalize different apostrophe types
      .replace(/[""]/g, '"') // Normalize different quote types
      ;
  };

  const processArtists = useCallback(() => {
    const artistMap = new Map<string, Artist>();
    const normalizedToOriginal = new Map<string, string>(); // Track normalized -> original name mapping

    collection.forEach(album => {
      // Handle albums with multiple artists
      if (album.artists && album.artists.length > 0) {
        // Process each individual artist
        album.artists.forEach(artistInfo => {
          const artistName = artistInfo.name;
          const normalizedName = normalizeArtistName(artistName);
          
          // Skip "Various" artists
          if (normalizedName === 'various') {
            return;
          }
          
          // Use normalized name as key but preserve original name for display
          if (!artistMap.has(normalizedName)) {
            artistMap.set(normalizedName, {
              name: artistName, // Use original name for display
              uri: artistInfo.uri_artist,
              albums: [],
              albumCount: 0,
              genres: [],
              image: getArtistImageFromData(artistInfo.uri_artist, 'medium'),
              latestAlbum: album.date_added,
              biography: artistInfo.biography || undefined
            });
            normalizedToOriginal.set(normalizedName, artistName);
          } else {
            // If we already have this normalized artist, prefer the most "canonical" name
            const existingOriginal = normalizedToOriginal.get(normalizedName)!;
            // Prefer names with proper capitalization (more uppercase letters usually means more canonical)
            const currentScore = (artistName.match(/[A-Z]/g) || []).length;
            const existingScore = (existingOriginal.match(/[A-Z]/g) || []).length;
            if (currentScore > existingScore) {
              const artist = artistMap.get(normalizedName)!;
              artist.name = artistName; // Update to more canonical name
              normalizedToOriginal.set(normalizedName, artistName);
            }
            // Use biography if we don't have one yet
            const artist = artistMap.get(normalizedName)!;
            if (!artist.biography && artistInfo.biography) {
              artist.biography = artistInfo.biography;
            }
          }

          const artist = artistMap.get(normalizedName)!
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
            artist.image = getArtistImageFromData(artistInfo.uri_artist, 'medium');
          }
        });
      } else {
        // Fallback to original artist field for backward compatibility
        const artistName = album.release_artist;
        const normalizedName = normalizeArtistName(artistName);
        
        // Skip "Various" artists
        if (normalizedName === 'various') {
          return;
        }
        
        // Use normalized name as key but preserve original name for display
        if (!artistMap.has(normalizedName)) {
          artistMap.set(normalizedName, {
            name: artistName, // Use original name for display
            uri: album.uri_artist,
            albums: [],
            albumCount: 0,
            genres: [],
            image: getArtistImageFromData(album.uri_artist, 'medium'),
            latestAlbum: album.date_added,
            biography: undefined
          });
          normalizedToOriginal.set(normalizedName, artistName);
        } else {
          // If we already have this normalized artist, prefer the most "canonical" name
          const existingOriginal = normalizedToOriginal.get(normalizedName)!;
          // Prefer names with proper capitalization (more uppercase letters usually means more canonical)
          const currentScore = (artistName.match(/[A-Z]/g) || []).length;
          const existingScore = (existingOriginal.match(/[A-Z]/g) || []).length;
          if (currentScore > existingScore) {
            const artist = artistMap.get(normalizedName)!;
            artist.name = artistName; // Update to more canonical name
            normalizedToOriginal.set(normalizedName, artistName);
          }
        }

        const artist = artistMap.get(normalizedName)!;
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
          artist.image = getArtistImageFromData(album.uri_artist, 'medium');
        }
      }
    });

    setArtists(Array.from(artistMap.values()));
  }, [collection]);

  const filterAndSortArtists = useCallback(() => {
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
  }, [artists, searchTerm, sortBy, selectedLetter]);

  useEffect(() => {
    loadCollection();
  }, []);

  useEffect(() => {
    if (collection.length > 0) {
      processArtists();
    }
  }, [collection, processArtists]);

  // Update URL params when filters change
  const updateURLParams = (newParams: Record<string, string>, resetToPage1 = false) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(newParams).forEach(([key, value]) => {
      if ((key === 'letter' && value === 'all') || (key === 'sort' && value === 'name')) {
        params.delete(key);
      } else if (key === 'search' && value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    setSearchParams(params);

    // Navigate to page 1 with preserved query params when filter changes
    if (resetToPage1 && currentPage !== 1) {
      const queryString = params.toString();
      navigate(queryString ? `/artists/1?${queryString}` : '/artists/1');
    }
  };

  useEffect(() => {
    filterAndSortArtists();
  }, [artists, searchTerm, sortBy, selectedLetter, filterAndSortArtists]);

  // Listen for URL parameter changes
  useEffect(() => {
    const sort = searchParams.get('sort') || 'name';
    const letter = searchParams.get('letter') || 'all';
    const search = searchParams.get('search') || '';
    
    setSortBy(sort);
    setSelectedLetter(letter);
    setSearchTerm(search);
  }, [searchParams]);

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
      const end = Math.min(totalPages - 1, start + showPages - 1);
      
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
    <div className="container mx-auto px-4 pt-24 pb-8">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 p-4 bg-background/50 backdrop-blur-sm border rounded-lg">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder="Search artists..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              updateURLParams({ search: e.target.value }, true);
            }}
            className="pl-9 pr-9 h-8"
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                updateURLParams({ search: '' }, true);
              }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Sort:</span>
          <Select value={sortBy} onValueChange={(value) => {
            setSortBy(value);
            updateURLParams({ sort: value }, true);
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
                updateURLParams({ letter: 'all' }, true);
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
                      updateURLParams({ letter: letter }, true);
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
            <h3 className="text-lg font-semibold mb-2 text-foreground">No artists found</h3>
            <p className="text-muted-foreground">Try adjusting your search</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4 max-w-7xl mx-auto">
          {paginatedArtists.map((artist) => (
            <ArtistCard
              key={artist.uri}
              artist={artist}
            />
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
                  onClick={() => navigate(buildPageUrl(Math.max(1, currentPage - 1)))}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>

              {getPageNumbers().map((pageNum, index) => (
                <PaginationItem key={index}>
                  {pageNum === '...' ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      onClick={() => navigate(buildPageUrl(pageNum as number))}
                      isActive={currentPage === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}

              <PaginationItem>
                <PaginationNext
                  onClick={() => navigate(buildPageUrl(Math.min(totalPages, currentPage + 1)))}
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