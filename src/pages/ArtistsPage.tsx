import { Fragment, useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArtistCard, ArtistPhoto } from '@/components/ArtistCard';
import { PageContainer } from '@/components/layout';
import { FloodBand, useRecordsFlood } from '@/components/player';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { cn } from '@/lib/utils';
import { floodFor } from '@/lib/sleeveColour';
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
  /** date_added of the first record filed under them. */
  firstAdded: string;
  biography?: string;
}

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'name', label: 'A–Z' },
  { value: 'albums', label: 'Most records' },
  { value: 'latest', label: 'Latest added' },
];

/** Records an artist needs for a double-size tile in the grid. */
const FEATURE_MIN_RECORDS = 5;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The A–Z bucket for a name: its first letter, accents dropped, or "#" for digits and punctuation. */
function letterOf(name: string): string {
  const first = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

/**
 * The run a card is filed under in the grid, each led by a divider card: the
 * first letter in A–Z, the month of their latest record in Latest added.
 */
function runOf(artist: Pick<Artist, 'name' | 'latestAlbum'>, sortBy: string): { key: string; label: string; year?: string } | null {
  if (sortBy === 'name') {
    const letter = letterOf(artist.name);
    return { key: letter, label: letter };
  }
  if (sortBy === 'latest') {
    const [year, month] = artist.latestAlbum.split('-');
    return { key: `${year}-${month}`, label: MONTHS[Number(month) - 1] ?? month, year };
  }
  return null;
}

/** An artist's most recently added records, latest first. */
function latestRecords(artist: Pick<Artist, 'albums'>, n: number): Album[] {
  return [...artist.albums].sort((a, b) => b.date_added.localeCompare(a.date_added)).slice(0, n);
}

/** An artist's most common genres across their records. */
function topGenres(artist: Pick<Artist, 'albums'>, n: number): string[] {
  const counts = new Map<string, number>();
  artist.albums.forEach((album) => album.genre_names.forEach((g) => counts.set(g, (counts.get(g) ?? 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g);
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
              firstAdded: album.date_added,
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

          if (album.date_added < artist.firstAdded) artist.firstAdded = album.date_added;

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
            firstAdded: album.date_added,
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

        if (album.date_added < artist.firstAdded) artist.firstAdded = album.date_added;

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
  // The header band and page ground take the colours of the first artists' latest records.
  const flood = useRecordsFlood(paginatedArtists.map(a => a.latestRelease));

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

  // A–Z and Latest added are a grid of cards with a divider card inline
  // wherever a new letter or month starts; Most records is a ranked list.
  const runCounts = new Map<string, number>();
  filteredArtists.forEach((a) => {
    const run = runOf(a, sortBy);
    if (run) runCounts.set(run.key, (runCounts.get(run.key) ?? 0) + 1);
  });
  const topCount = filteredArtists[0]?.albumCount ?? 1;

  // The header's line about the collection as a whole.
  const thisYear = String(new Date().getFullYear());
  const mostCollected = artists.reduce<Artist | null>((top, a) => (!top || a.albumCount > top.albumCount ? a : top), null);
  const newThisYear = artists.filter((a) => a.firstAdded.startsWith(thisYear)).length;

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
    <>
      <FloodBand flood={flood}>
        {/* Title + count ------------------------------------------------- */}
        <header className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <h1 className="t-disp m-0 text-[44px] md:text-[72px] lg:text-[96px]">Artists</h1>
          {countLabel && (
            <span className="t-disp text-[28px] text-[color:var(--cream-dim)] md:text-[44px] lg:text-[56px]" aria-label={`${countLabel} artists`}>
              {countLabel}
            </span>
          )}
        </header>
        {!pending && mostCollected && (
          <p className="t-mono m-0 mt-5 text-[12px] uppercase leading-relaxed text-[color:var(--cream-dim)] md:text-[13px]">
            <span className="whitespace-nowrap">{collection.length.toLocaleString('en-GB')} records ·</span>{' '}
            <span className="whitespace-nowrap">
              Most collected{' '}
              <Link to={mostCollected.uri} className="text-[color:var(--cream)] underline decoration-[color:var(--cream-rule)] underline-offset-4 hover:decoration-current">
                {mostCollected.name}
              </Link>
              , {mostCollected.albumCount.toLocaleString('en-GB')} ·
            </span>{' '}
            <span className="whitespace-nowrap">
              {newThisYear.toLocaleString('en-GB')} new in {thisYear}
            </span>
          </p>
        )}
      </FloodBand>

      <PageContainer className="text-[color:var(--cream)]">
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
          sortBy === 'albums' ? (
            <RankedArtists artists={paginatedArtists} firstRank={startIndex + 1} topCount={topCount} colorMap={colorMap} />
          ) : (
            <div className="grid grid-flow-row-dense grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 md:gap-x-6 lg:grid-cols-5 xl:grid-cols-6">
              {paginatedArtists.map((artist, i) => {
                const feature = artist.albumCount >= FEATURE_MIN_RECORDS;
                const run = runOf(artist, sortBy);
                const newRun = run && (i === 0 || runOf(paginatedArtists[i - 1], sortBy)?.key !== run.key);
                return (
                  <Fragment key={artist.uri}>
                    {newRun && <RunDivider label={run.label} year={run.year} count={runCounts.get(run.key) ?? 0} />}
                    <ArtistCard
                      artist={artist}
                      feature={feature}
                      records={latestRecords(artist, 3)}
                      palette={colorMap?.[artist.latestRelease] ?? null}
                      className={feature ? 'sm:col-span-2 sm:row-span-2' : undefined}
                    />
                  </Fragment>
                );
              })}
            </div>
          )
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
    </>
  );
}

/**
 * A rack divider leading each run in the grid (a letter in A–Z, a month in
 * Latest added): a card as wide as an artist photo and as tall as the whole
 * tile, with a tab on top, the label large and the run's artist count below.
 */
function RunDivider({ label, year, count }: { label: string; year?: string; count: number }) {
  const artistsLabel = `${count.toLocaleString('en-GB')} ${count === 1 ? 'artist' : 'artists'}`;
  return (
    <div className="flex min-w-0 flex-col p-2 pt-5">
      <div className="relative min-h-full flex-1 [container-type:inline-size]">
        <span aria-hidden className="absolute -top-3 left-[12%] h-6 w-2/5 rounded-t-xl bg-[var(--cream)]" />
        <div className="absolute inset-0 flex flex-col justify-between rounded-2xl bg-[var(--cream)] p-[9cqw] text-[color:var(--ground)]">
          <h2 className={cn('t-disp m-0 leading-[0.8]', label.length > 1 ? 'text-[36cqw]' : 'text-[78cqw]')}>
            {label}
            {year && <span className="mt-[4cqw] block text-[20cqw] opacity-60">{year}</span>}
          </h2>
          <span className="t-mono text-[11px] font-bold uppercase md:text-[12px]">{artistsLabel}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Most records as a chart: rank, photo, name and main genres, and a bar for
 * the record count against the most collected artist, in the colour of their
 * latest sleeve. Two columns from lg, read down then across.
 */
function RankedArtists({
  artists,
  firstRank,
  topCount,
  colorMap,
}: {
  artists: Artist[];
  firstRank: number;
  topCount: number;
  colorMap: ReturnType<typeof useAlbumColorMap>;
}) {
  return (
    <ol
      className="m-0 grid list-none grid-cols-1 gap-x-10 gap-y-2 p-0 lg:grid-flow-col lg:grid-cols-2"
      style={{ gridTemplateRows: `repeat(${Math.ceil(artists.length / 2)}, auto)` }}
    >
      {artists.map((artist, i) => {
        const { flood } = floodFor(colorMap?.[artist.latestRelease] ?? null);
        const count = artist.albumCount;
        return (
          <li key={artist.uri} className="min-w-0">
            <Link
              to={artist.uri}
              className="group grid grid-cols-[2.25rem_3.5rem_minmax(0,1fr)_auto] items-center gap-x-4 rounded-2xl px-2 py-2.5 text-[color:var(--cream)] outline-none transition-colors hover:bg-[var(--ground-2)] focus-visible:ring-2 focus-visible:ring-[color:var(--cream)] md:grid-cols-[2.75rem_4rem_minmax(0,1.5fr)_minmax(0,1fr)_auto]"
              style={{ '--accent': flood } as CSSProperties}
            >
              <span className="t-mono text-right text-[13px] font-bold text-[color:var(--cream-dim)]">
                {(firstRank + i).toLocaleString('en-GB')}
              </span>
              <ArtistPhoto
                uri={artist.uri}
                image={artist.image}
                size={128}
                className="aspect-square w-full shadow-[0_0_0_2px_var(--ground),0_0_0_4px_var(--accent)]"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="t-dispn truncate text-[16px] leading-tight md:text-[18px]">{artist.name}</span>
                <span className="t-mono truncate text-[11px] uppercase text-[color:var(--cream-dim)]">
                  {topGenres(artist, 2).join(' · ')}
                </span>
              </span>
              <span aria-hidden className="col-span-3 col-start-2 row-start-2 mt-2 h-2 overflow-hidden rounded-full bg-[var(--ground-3)] md:col-span-1 md:col-start-auto md:row-start-auto md:mt-0">
                <span
                  className="block h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${Math.max(2, (count / topCount) * 100)}%` }}
                />
              </span>
              <span className="t-disp col-start-4 row-start-1 text-right text-[22px] md:col-start-5 md:text-[26px]" aria-label={`${count} records`}>
                {count.toLocaleString('en-GB')}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
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
