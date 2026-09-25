import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArtistCard } from '@/components/ArtistCard';
import { PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { cn } from '@/lib/utils';
import { appConfig } from '@/config/app.config';
import { getArtistImageFromData } from '@/lib/image-utils';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { loadCollection as loadSharedCollection } from '@/lib/collection';
import type { Album } from '@/types/album';

interface Artist {
  name: string;
  uri: string;
  albums: Album[];
  albumCount: number;
  genres: string[];
  image: string;
  latestAlbum: string;
  /** uri_release of the most recently added record; its sleeve colours the card. */
  latestRelease: string;
  biography?: string;
}

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'name', label: 'A–Z' },
  { value: 'albums', label: 'Most records' },
  { value: 'latest', label: 'Latest added' },
];

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
  const colorMap = useAlbumColorMap();
  
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
      const data = await loadSharedCollection();
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
              latestRelease: album.uri_release,
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
            artist.latestRelease = album.uri_release;
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
            latestRelease: album.uri_release,
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
          artist.latestRelease = album.uri_release;
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

  const availableLetters = getAvailableLetters();
  const hasFilters = !!searchTerm || selectedLetter !== 'all';
  // Artists are derived in effects after the collection lands; keep the
  // skeleton up until they exist so "No artists found" never flashes.
  const pending =
    loading ||
    (collection.length > 0 && artists.length === 0) ||
    (artists.length > 0 && filteredArtists.length === 0 && !hasFilters);
  const countLabel = pending ? '' : filteredArtists.length.toLocaleString('en-GB');

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedLetter('all');
    updateURLParams({ search: '', letter: 'all' }, true);
  };

  return (
    <PageContainer className="text-[color:var(--cream)]">
      {/* Title + count ------------------------------------------------- */}
      <header className="mb-8 flex flex-wrap items-baseline gap-x-5 gap-y-2 md:mb-10">
        <h1 className="t-disp m-0 text-[44px] md:text-[72px] lg:text-[96px]">Artists</h1>
        {countLabel && (
          <span className="t-disp text-[28px] text-[color:var(--cream-dim)] md:text-[44px] lg:text-[56px]" aria-label={`${countLabel} artists`}>
            {countLabel}
          </span>
        )}
      </header>

      {/* Controls ------------------------------------------------------- */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex h-12 min-w-0 items-center gap-3 rounded-full border-2 border-[color:var(--cream-rule)] bg-[var(--ground-2)] px-5 transition-colors focus-within:border-[color:var(--cream)] lg:w-[360px]">
          <Search className="h-[18px] w-[18px] shrink-0 text-[color:var(--cream-dim)]" aria-hidden />
          <input
            type="search"
            placeholder="Search artists"
            aria-label="Search artists"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              updateURLParams({ search: e.target.value }, true);
            }}
            className="h-full w-full min-w-0 bg-transparent text-[15px] text-[color:var(--cream)] placeholder:text-[color:var(--cream-dim)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                updateURLParams({ search: '' }, true);
              }}
              aria-label="Clear search"
              className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--cream-dim)] transition-colors hover:text-[color:var(--cream)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </label>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sort artists">
          {SORT_OPTIONS.map((option) => {
            const active = sortBy === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSortBy(option.value);
                  updateURLParams({ sort: option.value }, true);
                }}
                className={cn(
                  'pill px-4 text-[14px]',
                  active
                    ? 'pill-solid bg-[var(--cream)] text-[color:var(--ground)]'
                    : 'text-[color:var(--cream-dim)] hover:text-[color:var(--cream)]',
                )}
              >
                {option.label}
              </button>
            );
          })}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="pill px-4 text-[14px] border-[color:var(--cream-rule)] text-[color:var(--cream-dim)] hover:text-[color:var(--cream)]"
            >
              <X className="h-4 w-4" aria-hidden />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* A–Z ------------------------------------------------------------- */}
      <nav aria-label="Filter by first letter" className="-mx-5 mb-10 px-5 md:mx-0 md:px-0">
        <div className="shelf-scroll gap-1.5 pb-1 md:flex-wrap">
          <LetterPill
            active={selectedLetter === 'all'}
            available
            wide
            onClick={() => {
              setSelectedLetter('all');
              updateURLParams({ letter: 'all' }, true);
            }}
          >
            All
          </LetterPill>
          {getAllLetters().map((letter) => {
            const available = availableLetters.includes(letter);
            return (
              <LetterPill
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
              </LetterPill>
            );
          })}
        </div>
      </nav>

      {/* Grid ------------------------------------------------------------ */}
      {pending ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" aria-live="polite" aria-busy>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center p-2">
              <div className="aspect-square w-full animate-pulse rounded-full bg-[var(--ground-3)] motion-reduce:animate-none" />
              <div className="mt-5 h-4 w-2/3 animate-pulse rounded-full bg-[var(--ground-3)] motion-reduce:animate-none" />
            </div>
          ))}
          <span className="sr-only">Loading artists</span>
        </div>
      ) : filteredArtists.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-2xl bg-[var(--ground-2)] px-6 py-10 md:px-10">
          <p className="t-disp m-0 text-[26px] md:text-[32px]">No artists found</p>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="pill px-4 text-[14px] text-[color:var(--cream)]">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 md:gap-x-6 lg:grid-cols-5 xl:grid-cols-6">
          {paginatedArtists.map((artist, i) => (
            <ArtistCard
              key={artist.uri}
              artist={artist}
              index={startIndex + i + 1}
              palette={colorMap?.[artist.latestRelease] ?? null}
            />
          ))}
        </div>
      )}

      {/* Pagination ------------------------------------------------------ */}
      {!pending && totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-14 flex flex-wrap items-center justify-center gap-2 border-t border-[color:var(--cream-rule)] pt-8">
          <PagePill
            to={buildPageUrl(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            ariaLabel="Previous page"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Prev</span>
          </PagePill>

          {getPageNumbers().map((pageNum, index) =>
            pageNum === '...' ? (
              <span key={`gap-${index}`} className="t-mono px-1 text-[13px] text-[color:var(--cream-dim)]" aria-hidden>
                …
              </span>
            ) : (
              <PagePill
                key={pageNum}
                to={buildPageUrl(pageNum as number)}
                active={currentPage === pageNum}
                ariaLabel={`Page ${pageNum}`}
                round
              >
                {pageNum}
              </PagePill>
            ),
          )}

          <PagePill
            to={buildPageUrl(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            ariaLabel="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </PagePill>
        </nav>
      )}
    </PageContainer>
  );
}

function LetterPill({
  active,
  available,
  wide,
  onClick,
  children,
}: {
  active: boolean;
  available: boolean;
  wide?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      aria-pressed={active}
      className={cn(
        't-mono flex h-11 shrink-0 items-center justify-center rounded-full text-[13px] font-bold uppercase transition-colors duration-200 motion-reduce:transition-none',
        wide ? 'px-4' : 'w-11',
        active && 'bg-[var(--cream)] text-[color:var(--ground)]',
        !active && available && 'text-[color:var(--cream)] hover:bg-[var(--ground-3)]',
        !available && 'cursor-default text-[color:var(--cream-dim)] opacity-35',
      )}
    >
      {children}
    </button>
  );
}

function PagePill({
  to,
  active,
  disabled,
  round,
  ariaLabel,
  children,
}: {
  to: string;
  active?: boolean;
  disabled?: boolean;
  round?: boolean;
  ariaLabel: string;
  children: ReactNode;
}) {
  const classes = cn(
    'pill t-mono px-4 text-[13px]',
    round && 'w-11 px-0',
    active
      ? 'pill-solid bg-[var(--cream)] text-[color:var(--ground)]'
      : 'border-[color:var(--cream-rule)] text-[color:var(--cream)] hover:border-[color:var(--cream)]',
  );

  if (disabled) {
    return (
      <span className={cn(classes, 'pointer-events-none opacity-35')} aria-disabled="true" aria-label={ariaLabel}>
        {children}
      </span>
    );
  }

  return (
    <Link to={to} className={classes} aria-label={ariaLabel} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  );
}
