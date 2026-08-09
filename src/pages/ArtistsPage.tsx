import { useState, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArtistCard } from '@/components/ArtistCard';
import { EditorialEmpty, EditorialSkeleton, PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';
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
import { excludeBoxsetMembers } from '@/lib/boxsets';

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
      // Keep artist album counts aligned with stats: boxset members don't count.
      setCollection(excludeBoxsetMembers(data));
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
      <PageContainer>
        <EditorialSkeleton label="Loading roster…" />
      </PageContainer>
    );
  }

  const availableLetters = getAvailableLetters();

  return (
    <PageContainer>
      {/* Filter row ------------------------------------------------------ */}
      <div className="mb-6 flex flex-col gap-3 border-y border-rule-strong bg-paper-2/40 md:flex-row md:items-stretch md:gap-0 md:divide-x md:divide-rule-strong">
        <label className="relative flex min-w-0 items-center gap-2 px-4 focus-within:text-ink md:flex-1">
          <Search className="h-4 w-4 shrink-0 text-ink-dim" aria-hidden />
          <input
            type="search"
            placeholder="Search artists…"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              updateURLParams({ search: e.target.value }, true);
            }}
            className="h-10 w-full min-w-0 bg-transparent font-grot text-[14px] text-ink placeholder:text-ink-dim focus:outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                updateURLParams({ search: '' }, true);
              }}
              aria-label="Clear search"
              className="shrink-0 text-ink-dim transition-colors hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        <div className="flex items-center gap-3 px-4 py-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
            Sort
          </span>
          <Select
            value={sortBy}
            onValueChange={(value) => {
              setSortBy(value);
              updateURLParams({ sort: value }, true);
            }}
          >
            <SelectTrigger className="h-8 min-w-[140px] gap-2 border-0 bg-transparent px-0 font-grot text-[13px] font-medium tracking-[-0.005em] text-ink shadow-none focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none border border-rule-strong font-grot">
              <SelectItem value="name" className="rounded-none font-grot text-[13px]">Artist Name</SelectItem>
              <SelectItem value="albums" className="rounded-none font-grot text-[13px]">Album Count</SelectItem>
              <SelectItem value="latest" className="rounded-none font-grot text-[13px]">Latest Addition</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* A-Z alphabet strip --------------------------------------------- */}
      <div className="mb-8 flex flex-wrap gap-0 border border-rule-strong bg-paper font-mono text-[11px] tracking-[0.04em]">
        <LetterCell
          active={selectedLetter === 'all'}
          available
          onClick={() => {
            setSelectedLetter('all');
            updateURLParams({ letter: 'all' }, true);
          }}
        >
          All
        </LetterCell>
        {getAllLetters().map((letter) => {
          const available = availableLetters.includes(letter);
          return (
            <LetterCell
              key={letter}
              active={selectedLetter === letter}
              available={available}
              onClick={() => {
                if (!available) return;
                setSelectedLetter(letter);
                updateURLParams({ letter }, true);
              }}
            >
              {letter}
            </LetterCell>
          );
        })}
      </div>

      {filteredArtists.length === 0 ? (
        <EditorialEmpty
          title="No artists found"
          detail="Try adjusting your search"
        />
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {paginatedArtists.map((artist, i) => (
            <ArtistCard
              key={artist.uri}
              artist={artist}
              index={startIndex + i + 1}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-12 border-t border-rule pt-6">
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
    </PageContainer>
  );
}

function LetterCell({
  active,
  available,
  onClick,
  children,
}: {
  active: boolean;
  available: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className={cn(
        "flex h-9 w-9 items-center justify-center border-r border-rule transition-colors last:border-r-0",
        active && "bg-ink text-paper",
        !active && available && "text-ink hover:bg-paper-2",
        !available && "text-ink-dim opacity-40",
      )}
    >
      {children}
    </button>
  );
}
