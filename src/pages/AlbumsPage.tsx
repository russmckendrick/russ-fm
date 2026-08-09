import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AlbumCard } from '@/components/AlbumCard';
import { FilterBar } from '@/components/FilterBar';
import { EditorialEmpty, EditorialSkeleton, PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { excludeBoxsetMembers } from '@/lib/boxsets';
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
  json_detailed_release: string;
  json_detailed_artist: string;
  images_uri_release: {
    'hi-res': string;
    medium: string;
  };
  images_uri_artist: {
    'hi-res': string;
    medium: string;
  };
}

export function AlbumsPage() {
  const { page } = useParams<{ page?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Check if page parameter is a non-numeric string and redirect to album detail
  useEffect(() => {
    if (page && isNaN(parseInt(page, 10))) {
      // If it's not a number, redirect to /album/${page}
      navigate(`/album/${page}`, { replace: true });
    }
  }, [page, navigate]);
  
  const [collection, setCollection] = useState<Album[]>([]);
  const [filteredCollection, setFilteredCollection] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState(searchParams.get('genre') || 'all');
  const [selectedYear, setSelectedYear] = useState(searchParams.get('year') || 'all');
  const [selectedFormat, setSelectedFormat] = useState(searchParams.get('format') || 'all');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'date_added');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  
  const itemsPerPage = appConfig.pagination.itemsPerPage.albums;
  const currentPage = page ? parseInt(page, 10) : 1;

  // Build navigation URL with current query params
  const buildPageUrl = (pageNum: number) => {
    const queryString = searchParams.toString();
    return queryString ? `/albums/${pageNum}?${queryString}` : `/albums/${pageNum}`;
  };

  // Generate dynamic page title
  const getPageTitle = () => {
    const parts = ['Record Collection'];
    
    if (selectedGenre !== 'all') {
      parts.push(selectedGenre);
    }
    
    if (selectedYear !== 'all') {
      parts.push(`${selectedYear} Releases`);
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
      // Boxset members are reachable via search and their boxset's page, not the browse grid.
      setCollection(excludeBoxsetMembers(data));
      setLoading(false);
    } catch (error) {
      console.error('Error loading collection:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollection();
  }, []);

  // Listen for URL parameter changes
  useEffect(() => {
    const genre = searchParams.get('genre') || 'all';
    const year = searchParams.get('year') || 'all';
    const format = searchParams.get('format') || 'all';
    const sort = searchParams.get('sort') || 'date_added';
    const search = searchParams.get('search') || '';

    setSelectedGenre(genre);
    setSelectedYear(year);
    setSelectedFormat(format);
    setSortBy(sort);
    setSearchTerm(search);
  }, [searchParams]);

  // Update URL params when filters change
  const updateURLParams = (newParams: Record<string, string>, resetToPage1 = false) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(newParams).forEach(([key, value]) => {
      if ((key === 'genre' || key === 'year' || key === 'format') && value === 'all') {
        params.delete(key);
      } else if (key === 'sort' && value === 'date_added') {
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
      navigate(queryString ? `/albums/1?${queryString}` : '/albums/1');
    }
  };

  const filterAndSortCollection = useCallback(() => {
    let filtered = [...collection];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(album =>
        album.release_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        album.release_artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
        album.genre_names.some(genre => genre.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (album.artists && album.artists.some(artist => 
          artist.name.toLowerCase().includes(searchTerm.toLowerCase())
        ))
      );
    }

    // Apply genre filter
    if (selectedGenre !== 'all') {
      filtered = filtered.filter(album => 
        album.genre_names.some(genre => genre === selectedGenre)
      );
    }

    // Apply year filter
    if (selectedYear !== 'all') {
      filtered = filtered.filter(album => {
        const albumYear = new Date(album.date_release_year).getFullYear().toString();
        return albumYear === selectedYear;
      });
    }

    // Apply format filter
    if (selectedFormat !== 'all') {
      filtered = filtered.filter(album => (album as Album & { format_primary?: string }).format_primary === selectedFormat);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'release_name':
          return a.release_name.localeCompare(b.release_name);
        case 'release_artist':
          return a.release_artist.localeCompare(b.release_artist);
        case 'date_release_year':
          return new Date(b.date_release_year).getTime() - new Date(a.date_release_year).getTime();
        default:
          return new Date(b.date_added).getTime() - new Date(a.date_added).getTime();
      }
    });

    setFilteredCollection(filtered);
  }, [collection, searchTerm, selectedGenre, selectedYear, selectedFormat, sortBy]);

  useEffect(() => {
    filterAndSortCollection();
  }, [collection, searchTerm, selectedGenre, selectedYear, selectedFormat, sortBy, filterAndSortCollection]);



  const getAllGenres = () => {
    const genres = new Set<string>();
    collection.forEach(album => {
      album.genre_names.forEach(genre => {
        if (genre.toLowerCase() !== 'music') { // Filter out "Music"
          genres.add(genre);
        }
      });
    });
    return Array.from(genres).sort();
  };

  const getAllYears = () => {
    const years = new Set<string>();
    collection.forEach(album => {
      const year = new Date(album.date_release_year).getFullYear().toString();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  };

  const getAllFormats = () => {
    const formats = new Set<string>();
    collection.forEach(album => {
      const f = (album as Album & { format_primary?: string }).format_primary;
      if (f) formats.add(f);
    });
    return Array.from(formats).sort();
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredCollection.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCollection = filteredCollection.slice(startIndex, endIndex);

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = [];
    const showPages = appConfig.pagination.showPageNumbers;
    
    if (totalPages <= showPages + 2) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      // Calculate range around current page
      let start = Math.max(2, currentPage - Math.floor(showPages / 2));
      const end = Math.min(totalPages - 1, start + showPages - 1);
      
      // Adjust start if we're near the end
      if (end === totalPages - 1) {
        start = Math.max(2, end - showPages + 1);
      }
      
      // Add ellipsis if needed
      if (start > 2) pages.push('...');
      
      // Add page numbers
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      // Add ellipsis if needed
      if (end < totalPages - 1) pages.push('...');
      
      // Always show last page
      if (totalPages > 1) pages.push(totalPages);
    }
    
    return pages;
  };

  if (loading) {
    return (
      <PageContainer>
        <EditorialSkeleton label="Loading catalogue…" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <FilterBar
        sortBy={sortBy}
        setSortBy={(value) => {
          setSortBy(value);
          updateURLParams({ sort: value }, true);
        }}
        selectedGenre={selectedGenre}
        setSelectedGenre={(value) => {
          setSelectedGenre(value);
          updateURLParams({ genre: value }, true);
        }}
        selectedYear={selectedYear}
        setSelectedYear={(value) => {
          setSelectedYear(value);
          updateURLParams({ year: value }, true);
        }}
        selectedFormat={selectedFormat}
        setSelectedFormat={(value) => {
          setSelectedFormat(value);
          updateURLParams({ format: value }, true);
        }}
        genres={getAllGenres()}
        years={getAllYears()}
        formats={getAllFormats()}
        searchValue={searchTerm}
        onSearchChange={(value) => {
          setSearchTerm(value);
          updateURLParams({ search: value }, true);
        }}
        searchPlaceholder="Search albums..."
      />


      {filteredCollection.length === 0 ? (
        <EditorialEmpty
          title="No albums found"
          detail="Try adjusting your search or filters"
        />
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {paginatedCollection.map((album, i) => (
            <AlbumCard
              key={album.uri_release}
              album={album}
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
