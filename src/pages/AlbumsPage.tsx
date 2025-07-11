import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Music } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AlbumCard } from '@/components/AlbumCard';
import { FilterBar } from '@/components/FilterBar';
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
    images_uri_artist: {
      small: string;
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
    small: string;
  };
  images_uri_artist: {
    'hi-res': string;
    medium: string;
    small: string;
  };
}

interface AlbumsPageProps {
  searchTerm: string;
}

export function AlbumsPage({ searchTerm }: AlbumsPageProps) {
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
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'date_added');
  const [prevSearchTerm, setPrevSearchTerm] = useState(searchTerm);
  
  const itemsPerPage = appConfig.pagination.itemsPerPage.albums;
  const currentPage = page ? parseInt(page, 10) : 1;

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

  useEffect(() => {
    loadCollection();
  }, []);

  // Update URL params when filters change
  const updateURLParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === 'all' || value === 'date_added') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    setSearchParams(params);
  };

  useEffect(() => {
    filterAndSortCollection();
    
    // Only navigate to page 1 if search term actually changed
    if (searchTerm !== prevSearchTerm) {
      setPrevSearchTerm(searchTerm);
      if (currentPage !== 1) {
        navigate('/albums/1');
      }
    }
  }, [collection, searchTerm, selectedGenre, selectedYear, sortBy]);


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

  const filterAndSortCollection = () => {
    let filtered = [...collection];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(album =>
        album.release_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        album.release_artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
        album.genre_names.some(genre => genre.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Apply genre filter
    if (selectedGenre && selectedGenre !== 'all') {
      filtered = filtered.filter(album =>
        album.genre_names.includes(selectedGenre)
      );
    }

    // Apply year filter
    if (selectedYear && selectedYear !== 'all') {
      filtered = filtered.filter(album => {
        const year = new Date(album.date_release_year).getFullYear().toString();
        return year === selectedYear;
      });
    }

    // Sort collection
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'release_name':
          return a.release_name.localeCompare(b.release_name);
        case 'release_artist':
          return a.release_artist.localeCompare(b.release_artist);
        case 'date_release_year':
          return new Date(b.date_release_year).getTime() - new Date(a.date_release_year).getTime();
        case 'date_added':
        default:
          return new Date(b.date_added).getTime() - new Date(a.date_added).getTime();
      }
    });

    setFilteredCollection(filtered);
  };


  const getAllGenres = () => {
    const genres = new Set<string>();
    collection.forEach(album => {
      album.genre_names.forEach(genre => genres.add(genre));
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
      let end = Math.min(totalPages - 1, start + showPages - 1);
      
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
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your collection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Filters */}
      <FilterBar
        sortBy={sortBy}
        setSortBy={(value) => {
          setSortBy(value);
          updateURLParams({ sort: value });
          if (currentPage !== 1) navigate('/albums/1');
        }}
        selectedGenre={selectedGenre}
        setSelectedGenre={(value) => {
          setSelectedGenre(value);
          updateURLParams({ genre: value });
          if (currentPage !== 1) navigate('/albums/1');
        }}
        selectedYear={selectedYear}
        setSelectedYear={(value) => {
          setSelectedYear(value);
          updateURLParams({ year: value });
          if (currentPage !== 1) navigate('/albums/1');
        }}
        genres={getAllGenres()}
        years={getAllYears()}
      />


      {/* Collection Grid */}
      {filteredCollection.length === 0 ? (
        <Card className="p-8 text-center">
          <CardContent>
            <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No albums found</h3>
            <p className="text-muted-foreground">Try adjusting your search or filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 max-w-7xl mx-auto">
          {paginatedCollection.map((album) => (
            <AlbumCard
              key={album.uri_release}
              album={album}
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
                  onClick={() => navigate(`/albums/${Math.max(1, currentPage - 1)}`)}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              
              {getPageNumbers().map((page, index) => (
                <PaginationItem key={index}>
                  {page === '...' ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      onClick={() => navigate(`/albums/${page}`)}
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
                  onClick={() => navigate(`/albums/${Math.min(totalPages, currentPage + 1)}`)}
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