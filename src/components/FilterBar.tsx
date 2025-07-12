import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface FilterBarProps {
  sortBy: string;
  setSortBy: (value: string) => void;
  selectedGenre: string;
  setSelectedGenre: (value: string) => void;
  selectedYear: string;
  setSelectedYear: (value: string) => void;
  genres: string[];
  years: string[];
}

export function FilterBar({
  sortBy,
  setSortBy,
  selectedGenre,
  setSelectedGenre,
  selectedYear,
  setSelectedYear,
  genres,
  years
}: FilterBarProps) {
  // Check if any filters are active (not at their default values)
  const hasActiveFilters = sortBy !== 'date_added' || selectedGenre !== 'all' || selectedYear !== 'all';
  
  const clearFilters = () => {
    setSortBy('date_added');
    setSelectedGenre('all');
    setSelectedYear('all');
  };

  return (
    <div className="flex flex-wrap gap-3 mb-6 p-4 bg-background/50 backdrop-blur-sm border rounded-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground whitespace-nowrap">Sort:</span>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[140px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_added">Recently Added</SelectItem>
            <SelectItem value="release_name">Album Name</SelectItem>
            <SelectItem value="release_artist">Artist Name</SelectItem>
            <SelectItem value="date_release_year">Release Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground whitespace-nowrap">Genre:</span>
        <Select value={selectedGenre} onValueChange={setSelectedGenre}>
          <SelectTrigger className="w-[120px] h-8">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {genres.map((genre) => (
              <SelectItem key={genre} value={genre} className="capitalize">
                {genre.toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground whitespace-nowrap">Year:</span>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[80px] h-8">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Clear Filters Button - only show when filters are active */}
      {hasActiveFilters && (
        <div className="flex items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilters}
            className="h-8 px-3 text-sm"
          >
            <X className="h-3 w-3 mr-1" />
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );
}