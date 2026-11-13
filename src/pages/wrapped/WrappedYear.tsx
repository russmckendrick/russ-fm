import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { LayoutList, Presentation } from 'lucide-react';
import { PillLink } from '@/components/player';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { appConfig } from '@/config/app.config';
import { loadCollection } from '@/lib/collection';
import type { WrappedData } from '@/types/wrapped';
import { YearSelector } from './components/YearSelector';

// The story chapters (and d3) load only when a Wrapped page is opened, the presentation only when it is.
const WrappedPresentation = lazy(() => import('./WrappedPresentation').then(m => ({ default: m.WrappedPresentation })));
const WrappedStory = lazy(() => import('./story/WrappedStory'));

type ViewMode = 'grid' | 'presentation';

const WRAP = 'mx-auto w-full max-w-[1640px] px-5 md:px-10 lg:px-14';

/**
 * `/wrapped/:year` — the year told as a scroll of chapters (story/WrappedStory),
 * drawn from the `story` block of the year's Wrapped file. A floating control
 * switches year or opens the full-screen presentation.
 */
export function WrappedYear() {
  const { year } = useParams<{ year: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const yearNum = year ? parseInt(year, 10) : null;
  const currentYear = new Date().getFullYear();

  const wrappedTitle = yearNum ? `${yearNum} Wrapped — a year in records | Russ.fm` : 'Wrapped | Russ.fm';
  const wrappedDescription = yearNum
    ? `${yearNum} in the russ.fm collection: top albums, top artists, and listening highlights from the year.`
    : 'A year in records on russ.fm.';
  const wrappedCanonical = yearNum ? `${appConfig.siteUrl}/wrapped/${yearNum}` : `${appConfig.siteUrl}/wrapped`;

  usePageTitle(wrappedTitle);
  useMetaTags({
    title: wrappedTitle,
    description: wrappedDescription,
    image: `${appConfig.siteUrl}/og-image.png`,
    url: wrappedCanonical,
    type: 'website',
    canonical: wrappedCanonical,
    jsonLd: yearNum
      ? [{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${appConfig.siteUrl}/` },
            { '@type': 'ListItem', position: 2, name: 'Wrapped', item: `${appConfig.siteUrl}/wrapped` },
            { '@type': 'ListItem', position: 3, name: String(yearNum) },
          ],
        }]
      : undefined,
  });

  // Discover which years have at least one release (used by the selector
  // and prev/next pager).
  useEffect(() => {
    let alive = true;
    loadCollection()
      .then(collection => {
        const years = new Set<number>();
        collection.forEach(release => {
          const y = new Date(release.date_added).getFullYear();
          if (!Number.isNaN(y)) years.add(y);
        });
        if (alive) setAvailableYears(Array.from(years).sort((a, b) => b - a));
      })
      .catch(err => console.error('Failed to load available years:', err));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!yearNum) return;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const fileName = yearNum === currentYear ? 'wrapped-ytd.json' : `wrapped-${yearNum}.json`;
        const response = await fetch(`/wrapped/${fileName}`);
        if (!response.ok) throw new Error(`Failed to load wrapped data for ${yearNum}`);
        setData(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load wrapped data');
      } finally {
        setLoading(false);
      }
    })();
  }, [yearNum, currentYear]);

  const { previousYear, nextYear } = useMemo(() => {
    if (!yearNum) return { previousYear: undefined, nextYear: undefined };
    return {
      previousYear: availableYears.filter(y => y < yearNum).sort((a, b) => b - a)[0],
      nextYear: availableYears.filter(y => y > yearNum).sort((a, b) => a - b)[0],
    };
  }, [availableYears, yearNum]);

  if (!year || !yearNum || Number.isNaN(yearNum)) {
    return <Navigate to={`/wrapped/${currentYear - 1}`} replace />;
  }

  if (loading) return <WrappedSkeleton year={yearNum} />;

  if (error || !data) {
    return (
      <div className={`${WRAP} py-16`}>
        <h1 className="t-disp m-0 text-[56px] md:text-[96px]">{yearNum}</h1>
        <p className="t-mono mt-6 text-[13px] text-[color:var(--cream-dim)]">{error || 'Failed to load wrapped data'}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <PillLink to="/" size="sm">Home</PillLink>
          {previousYear && <PillLink to={`/wrapped/${previousYear}`} size="sm">{previousYear}</PillLink>}
        </div>
      </div>
    );
  }

  if (viewMode === 'presentation') {
    return (
      <div key={yearNum} className="relative">
        <div className="fixed right-3 top-3 z-[80] flex items-center gap-2 rounded-full border border-white/15 bg-[rgba(20,18,16,.58)] p-1.5 text-[color:var(--cream)] shadow-[0_18px_40px_-18px_rgba(0,0,0,.8)] backdrop-blur-xl backdrop-saturate-150 md:right-5 md:top-4">
          <YearSelector
            currentYear={yearNum}
            availableYears={availableYears}
            onYearChange={y => navigate(`/wrapped/${y}`)}
            className="pill-sm border-[color:var(--cream-rule)]"
          />
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className="pill pill-sm pill-solid"
            style={{ background: 'var(--cream)', color: 'var(--ground)' }}
            aria-label="Close presentation and show the year page"
          >
            <LayoutList className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Year page</span>
          </button>
        </div>
        <Suspense fallback={<WrappedSkeleton year={yearNum} />}>
          <WrappedPresentation data={data} availableYears={availableYears} previousYear={previousYear} nextYear={nextYear} onClose={() => setViewMode('grid')} />
        </Suspense>
      </div>
    );
  }


  return (
    <div className="relative">
      <div className="fixed bottom-4 right-3 z-[80] flex items-center gap-2 rounded-full bg-[rgba(14,13,12,.92)] p-1.5 text-[color:var(--cream)] shadow-[0_18px_40px_-18px_rgba(0,0,0,.7)] md:right-5">
        <YearSelector
          currentYear={yearNum}
          availableYears={availableYears}
          onYearChange={y => navigate(`/wrapped/${y}`)}
          className="pill-sm border-[color:var(--cream-rule)]"
        />
        <button
          type="button"
          onClick={() => setViewMode('presentation')}
          className="pill pill-sm pill-solid"
          style={{ background: 'var(--cream)', color: 'var(--ground)' }}
        >
          <Presentation className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Presentation</span>
        </button>
      </div>
      <Suspense fallback={<WrappedSkeleton year={yearNum} />}>
        <WrappedStory data={data} />
      </Suspense>
    </div>
  );
}

function WrappedSkeleton({ year }: { year: number }) {
  return (
    <div className={`${WRAP} py-10 md:py-16`} aria-busy="true" aria-label={`Loading ${year} Wrapped`}>
      <div className="t-disp text-[clamp(88px,15vw,232px)] text-[color:var(--ground-3)]">{year}</div>
      <div className="mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[clamp(72px,11vw,168px)] animate-pulse rounded-2xl bg-[var(--ground-2)] motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
