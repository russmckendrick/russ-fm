import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PresentationContainer, PresentationSection } from './components/presentation/PresentationContainer';
import { SectionIndicator } from './components/presentation/SectionIndicator';
import { NavigationControls } from './components/presentation/NavigationControls';
import { useWrappedNavigation } from './hooks/useWrappedNavigation';
import { useAlbumColorsWithFallback } from '@/hooks/useAlbumColors';
import { Logo } from '@/components/Logo';

// Section components
import { IntroSection } from './components/sections/IntroSection';
import { YearSummarySection } from './components/sections/YearSummarySection';
import { HeroAlbumSection } from './components/sections/HeroAlbumSection';
import { TopArtistsSection } from './components/sections/TopArtistsSection';
import { GenreBreakdownSection } from './components/sections/GenreBreakdownSection';
import { MonthlyJourneySection } from './components/sections/MonthlyJourneySection';
import { TopAlbumsPerMonthSection } from './components/sections/TopAlbumsPerMonthSection';
import { DecadesSection } from './components/sections/DecadesSection';
import { ExploreSection } from './components/sections/ExploreSection';
import { YearNavigationSection } from './components/sections/YearNavigationSection';

import type { WrappedData, WrappedRelease } from '@/types/wrapped';

interface WrappedPresentationProps {
  data: WrappedData;
  availableYears: number[];
  previousYear?: number;
  nextYear?: number;
}

export function WrappedPresentation({ data, availableYears, previousYear, nextYear }: WrappedPresentationProps) {
  // Find first and last releases
  const sortedReleases = useMemo(() => {
    const releases = data.releases.map(r => r.release);
    return releases.sort((a, b) =>
      new Date(a.date_added).getTime() - new Date(b.date_added).getTime()
    );
  }, [data.releases]);

  const firstRelease = sortedReleases[0];
  const lastRelease = sortedReleases[sortedReleases.length - 1];

  // Get colors for key albums
  const firstAlbumColors = useAlbumColorsWithFallback(firstRelease?.slug);
  const lastAlbumColors = useAlbumColorsWithFallback(lastRelease?.slug);

  // Get accent color from top genre or first album
  const accentColor = firstAlbumColors?.accent || '#3b82f6';

  // Get months with releases for individual sections
  const monthsWithReleases = useMemo(() =>
    data.insights.timeline.filter(t => t.count > 0),
    [data.insights.timeline]
  );

  // Define sections count: 10 base sections + number of months with albums
  const BASE_SECTIONS = 10; // Intro, Summary, First Album, Artists, Genres, Monthly Journey, Decades, Last Album, Explore, Year Navigation
  const SECTION_COUNT = BASE_SECTIONS + monthsWithReleases.length;

  const navigation = useWrappedNavigation({
    totalSections: SECTION_COUNT,
    autoAdvanceDelay: 6000,
    onSectionChange: (section) => {
      // Optional: track section views
      console.log(`Viewing section ${section}`);
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* Home logo */}
      <Link
        to="/"
        className="fixed top-4 left-4 z-50 opacity-80 hover:opacity-100 transition-opacity"
        aria-label="Go to homepage"
      >
        <Logo className="w-10 h-10 text-white" />
      </Link>

      {/* Navigation indicators */}
      <SectionIndicator
        totalSections={SECTION_COUNT}
        currentSection={navigation.currentSection}
        progress={navigation.isAutoAdvancing ? navigation.progress : 0}
        onSectionClick={navigation.goToSection}
      />

      {/* Navigation controls */}
      <NavigationControls
        canGoNext={navigation.canGoNext}
        canGoPrev={navigation.canGoPrev}
        isAutoAdvancing={navigation.isAutoAdvancing}
        progress={navigation.isAutoAdvancing ? navigation.progress : 0}
        onNext={navigation.nextSection}
        onPrev={navigation.prevSection}
        onToggleAutoAdvance={navigation.toggleAutoAdvance}
      />

      {/* Main presentation container */}
      <PresentationContainer
        ref={navigation.containerRef}
        onScroll={navigation.handleScroll}
      >
        {/* Section 1: Intro */}
        <PresentationSection id="intro">
          <IntroSection
            year={data.year}
            isYearToDate={data.isYearToDate}
            colors={firstAlbumColors}
            totalReleases={data.summary.totalReleases}
          />
        </PresentationSection>

        {/* Section 2: Year Summary */}
        <PresentationSection id="summary">
          <YearSummarySection
            summary={data.summary}
            year={data.year}
            accentColor={accentColor}
          />
        </PresentationSection>

        {/* Section 3: First Album Hero */}
        {firstRelease && (
          <PresentationSection id="first-album">
            <HeroAlbumSection
              release={firstRelease}
              colors={firstAlbumColors}
              headline="My Year Started With"
              subheadline="The first album I added to my collection"
            />
          </PresentationSection>
        )}

        {/* Section 4: Top Artists */}
        <PresentationSection id="top-artists">
          <TopArtistsSection
            artists={data.insights.artists}
            accentColor={accentColor}
          />
        </PresentationSection>

        {/* Section 5: Genre Breakdown */}
        <PresentationSection id="genres">
          <GenreBreakdownSection
            genres={data.insights.genres}
            totalReleases={data.summary.totalReleases}
          />
        </PresentationSection>

        {/* Section 6: Monthly Journey */}
        <PresentationSection id="monthly">
          <MonthlyJourneySection
            timeline={data.insights.timeline}
            peakMonth={data.summary.peakMonth}
            accentColor={accentColor}
          />
        </PresentationSection>

        {/* Section 7: Decades */}
        <PresentationSection id="decades">
          <DecadesSection
            decades={data.insights.decades}
            totalReleases={data.summary.totalReleases}
          />
        </PresentationSection>

        {/* Section 8: Last Album Hero */}
        {lastRelease && (
          <PresentationSection id="last-album">
            <HeroAlbumSection
              release={lastRelease}
              colors={lastAlbumColors}
              headline="My Year Ended With"
              subheadline="The last album I added to my collection"
            />
          </PresentationSection>
        )}

        {/* Section 9: Explore All */}
        <ExploreSection data={data} />

        {/* Sections 10+: Albums by Month */}
        {monthsWithReleases.map((monthData, idx) => (
          <PresentationSection key={`monthly-section-${idx}`} id={`month-section-${idx}`}>
            <TopAlbumsPerMonthSection
              month={monthData.month}
              releases={monthData.releases}
              monthNumber={idx + 1}
              totalMonths={monthsWithReleases.length}
              accentColor={accentColor}
            />
          </PresentationSection>
        ))}

        {/* Final Section: Year Navigation */}
        <PresentationSection id="year-navigation">
          <YearNavigationSection
            currentYear={data.year}
            previousYear={previousYear}
            nextYear={nextYear}
            availableYears={availableYears}
          />
        </PresentationSection>
      </PresentationContainer>
    </div>
  );
}
