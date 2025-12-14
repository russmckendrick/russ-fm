import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { WrappedData } from '@/types/wrapped';
import { DynamicBentoGrid } from './components/DynamicBentoGrid';
import { SkeletonBentoGrid } from './components/SkeletonBentoGrid';
import { YearSelector } from './components/YearSelector';
import { YearPagination } from './components/YearPagination';
import { PageTransition } from './components/PageTransition';
import { WrappedPresentation } from './WrappedPresentation';
import { Grid3X3, Presentation } from 'lucide-react';

type ViewMode = 'presentation' | 'grid';

export function WrappedYear() {
  const { year } = useParams<{ year: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('presentation');

  const yearNum = year ? parseInt(year, 10) : null;
  const currentYear = new Date().getFullYear();

  // Set page title
  usePageTitle(data ? `${yearNum} Wrapped` : 'Wrapped');

  // Load available years
  useEffect(() => {
    const loadAvailableYears = async () => {
      try {
        const response = await fetch('/collection.json');
        const collection = await response.json();
        
        const years = new Set<number>();
        collection.forEach((release: { date_added: string }) => {
          const releaseYear = new Date(release.date_added).getFullYear();
          years.add(releaseYear);
        });
        
        setAvailableYears(Array.from(years).sort((a, b) => b - a));
      } catch (err) {
        console.error('Failed to load available years:', err);
      }
    };

    loadAvailableYears();
  }, []);

  // Load wrapped data for the year
  useEffect(() => {
    const loadData = async () => {
      if (!yearNum) return;

      setLoading(true);
      setError(null);

      try {
        const fileName = yearNum === currentYear ? 'wrapped-ytd.json' : `wrapped-${yearNum}.json`;
        const response = await fetch(`/wrapped/${fileName}`);
        
        if (!response.ok) {
          throw new Error(`Failed to load wrapped data for ${yearNum}`);
        }

        const wrappedData = await response.json();
        setData(wrappedData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load wrapped data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [yearNum, currentYear]);

  // If no year provided, redirect to previous year
  if (!year || !yearNum || isNaN(yearNum)) {
    return <Navigate to={`/wrapped/${currentYear - 1}`} replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          {/* Header skeleton */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="h-10 bg-gray-300 dark:bg-gray-700 rounded w-48 animate-pulse"></div>
              <div className="h-10 bg-gray-300 dark:bg-gray-700 rounded w-32 animate-pulse"></div>
            </div>
          </div>

          {/* Skeleton grid */}
          <SkeletonBentoGrid />
          
          {/* Navigation skeleton */}
          <div className="flex justify-center mt-8">
            <div className="flex space-x-4">
              <div className="h-10 bg-gray-300 dark:bg-gray-700 rounded w-20 animate-pulse"></div>
              <div className="h-10 bg-gray-300 dark:bg-gray-700 rounded w-20 animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Oops!</h2>
          <p className="text-muted-foreground mb-6">{error || 'Failed to load wrapped data'}</p>
          <button
            onClick={() => navigate('/wrapped')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Go to Wrapped Home
          </button>
        </div>
      </div>
    );
  }

  const previousYear = availableYears.filter(y => y < yearNum).sort((a, b) => b - a)[0];
  const nextYear = availableYears.filter(y => y > yearNum).sort((a, b) => a - b)[0];

  // Presentation view - full-screen immersive experience
  if (viewMode === 'presentation') {
    return (
      <div key={yearNum} className="relative">
        {/* View mode toggle - floating button */}
        <div className="fixed top-4 right-4 z-[60] flex items-center gap-2">
          <YearSelector
            currentYear={yearNum}
            availableYears={availableYears}
            onYearChange={(year) => navigate(`/wrapped/${year}`)}
          />
          <button
            onClick={() => setViewMode('grid')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white text-sm transition-all"
            aria-label="Switch to grid view"
          >
            <Grid3X3 className="w-4 h-4" />
            <span className="hidden sm:inline">Grid View</span>
          </button>
        </div>

        <WrappedPresentation
          data={data}
          availableYears={availableYears}
          previousYear={previousYear}
          nextYear={nextYear}
        />
      </div>
    );
  }

  // Grid view - original bento grid layout
  return (
    <PageTransition key={yearNum}>
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-4xl font-bold">
                {yearNum} Wrapped
                {data.isYearToDate && <span className="text-sm font-normal text-muted-foreground ml-2">(Year to Date)</span>}
              </h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('presentation')}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm transition-all"
                  aria-label="Switch to presentation view"
                >
                  <Presentation className="w-4 h-4" />
                  <span className="hidden sm:inline">Presentation</span>
                </button>
                <YearSelector
                  currentYear={yearNum}
                  availableYears={availableYears}
                  onYearChange={(year) => navigate(`/wrapped/${year}`)}
                />
              </div>
            </div>

            {data.isYearToDate && data.summary.projectedTotal && (
              <p className="text-muted-foreground">
                On track for {data.summary.projectedTotal} releases by year end
              </p>
            )}
          </div>

          {/* Main Dynamic Bento Grid */}
          <DynamicBentoGrid data={data} />

          {/* Navigation */}
          <YearPagination
            currentYear={yearNum}
            previousYear={previousYear}
            nextYear={nextYear}
            onNavigate={(year) => navigate(`/wrapped/${year}`)}
          />
        </div>
      </div>
    </PageTransition>
  );
}