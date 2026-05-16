import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Disc3,
  Grid3X3,
  Library,
} from 'lucide-react';
import { PresentationContainer, PresentationSection } from './components/presentation/PresentationContainer';
import { useWrappedNavigation } from './hooks/useWrappedNavigation';
import { Logo } from '@/components/Logo';
import { DragWall } from '@/components/layout';
import { GenreTag } from '@/components/ui/genre-tag';
import { handleImageError, migrateImageUri } from '@/lib/image-utils';
import type { ColorPalette, WrappedData, WrappedRelease } from '@/types/wrapped';

interface WrappedPresentationProps {
  data: WrappedData;
  availableYears: number[];
  previousYear?: number;
  nextYear?: number;
}

type TimelineMonth = WrappedData['insights']['timeline'][number];
type TopArtist = WrappedData['insights']['topArtists'][number] | WrappedData['insights']['artists'][number];

const defaultPalette: ColorPalette = {
  background: '#f4f1ea',
  foreground: '#0e0d0b',
  accent: '#e23b1e',
  muted: '#ebe6db',
};

const CHAPTERS = [
  { id: 'sleeve', label: 'Sleeve' },
  { id: 'bookends', label: 'Bookends' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'signals', label: 'Signals' },
  { id: 'shelves', label: 'Shelves' },
  { id: 'years', label: 'Years' },
];

export function WrappedPresentation({ data, availableYears, previousYear, nextYear }: WrappedPresentationProps) {
  const sortedReleases = useMemo(() => {
    return data.releases
      .map((r) => r.release)
      .sort((a, b) => new Date(a.date_added).getTime() - new Date(b.date_added).getTime());
  }, [data.releases]);

  const firstRelease = sortedReleases[0];
  const lastRelease = sortedReleases[sortedReleases.length - 1];
  const firstAlbumColors = data.theme?.primary || firstRelease?.colors || defaultPalette;
  const lastAlbumColors = data.theme?.secondary || lastRelease?.colors || defaultPalette;

  const monthsWithReleases = useMemo(
    () => data.insights.timeline.filter((month) => month.count > 0),
    [data.insights.timeline],
  );

  const peakMonth = useMemo(() => {
    const namedPeak = data.insights.timeline.find((month) => month.month === data.summary.peakMonth && month.count > 0);
    if (namedPeak) return namedPeak;
    return [...data.insights.timeline].sort((a, b) => b.count - a.count)[0];
  }, [data.insights.timeline, data.summary.peakMonth]);

  const navigation = useWrappedNavigation({
    totalSections: CHAPTERS.length,
  });

  return (
    <div id="wrapped-crate-journey" className="fixed inset-0 z-50 overflow-hidden bg-paper text-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            'linear-gradient(90deg, var(--ink) 1px, transparent 1px), linear-gradient(0deg, var(--ink) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 border-b border-rule bg-paper"
      />

      <Link
        to="/"
        className="fixed left-4 top-5 z-[70] inline-flex h-9 w-9 items-center justify-center bg-paper/80 text-ink backdrop-blur-sm transition-colors hover:text-hl"
        aria-label="Go to homepage"
      >
        <Logo className="h-8 w-8" />
      </Link>

      <ChapterRail
        chapters={CHAPTERS}
        currentSection={navigation.currentSection}
        onSectionClick={navigation.goToSection}
      />
      <ChapterControls
        canGoNext={navigation.canGoNext}
        canGoPrev={navigation.canGoPrev}
        onNext={navigation.nextSection}
        onPrev={navigation.prevSection}
      />

      <PresentationContainer
        ref={navigation.containerRef}
        onScroll={navigation.handleScroll}
        className="relative z-10 h-[100dvh]"
      >
        <PresentationSection id="crate-sleeve" className="h-[100dvh] min-h-[100dvh] items-stretch justify-stretch">
          <ChapterFrame>
            <SleeveIntro
              data={data}
              releases={sortedReleases}
              firstRelease={firstRelease}
              peakMonth={peakMonth}
            />
          </ChapterFrame>
        </PresentationSection>

        <PresentationSection id="crate-bookends" className="h-[100dvh] min-h-[100dvh] items-stretch justify-stretch">
          <ChapterFrame>
            <BookendsSection
              firstRelease={firstRelease}
              lastRelease={lastRelease}
              firstAlbumColors={firstAlbumColors}
              lastAlbumColors={lastAlbumColors}
            />
          </ChapterFrame>
        </PresentationSection>

        <PresentationSection id="crate-tempo" className="h-[100dvh] min-h-[100dvh] items-stretch justify-stretch">
          <ChapterFrame>
            <MonthlySpineSection
              timeline={data.insights.timeline}
              peakMonth={peakMonth}
              totalReleases={data.summary.totalReleases}
            />
          </ChapterFrame>
        </PresentationSection>

        <PresentationSection id="crate-signals" className="h-[100dvh] min-h-[100dvh] items-stretch justify-stretch">
          <ChapterFrame>
            <SignalsSection data={data} />
          </ChapterFrame>
        </PresentationSection>

        <PresentationSection id="crate-shelves" className="h-[100dvh] min-h-[100dvh] items-stretch justify-stretch">
          <ChapterFrame>
            <CrateShelvesSection months={monthsWithReleases} peakMonth={peakMonth} />
          </ChapterFrame>
        </PresentationSection>

        <PresentationSection id="crate-years" className="h-[100dvh] min-h-[100dvh] items-stretch justify-stretch">
          <ChapterFrame>
            <YearNavigationCrate
              currentYear={data.year}
              isYearToDate={data.isYearToDate}
              availableYears={availableYears}
              previousYear={previousYear}
              nextYear={nextYear}
              totalReleases={data.summary.totalReleases}
            />
          </ChapterFrame>
        </PresentationSection>
      </PresentationContainer>
    </div>
  );
}

function ChapterFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-stretch px-4 pb-14 pt-24 sm:px-8 lg:pl-28 lg:pr-10 2xl:pl-36 2xl:pr-14">
      <div className="mx-auto flex h-full w-full max-w-full min-w-0 items-center lg:max-w-[min(1900px,calc(100vw-12rem))]">
        {children}
      </div>
    </div>
  );
}

function ChapterRail({
  chapters,
  currentSection,
  onSectionClick,
}: {
  chapters: typeof CHAPTERS;
  currentSection: number;
  onSectionClick: (index: number) => void;
}) {
  return (
    <>
      <nav
        className="fixed left-4 top-1/2 z-[65] hidden -translate-y-1/2 bg-paper/70 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim backdrop-blur-sm md:block"
        aria-label="Crate chapter navigation"
      >
        {chapters.map((chapter, index) => {
          const active = index === currentSection;
          return (
            <button
              key={chapter.id}
              type="button"
              onClick={() => onSectionClick(index)}
              className={`grid w-28 grid-cols-[20px_22px_minmax(0,1fr)] items-center gap-2 py-2 text-left transition-colors ${
                active ? 'text-ink' : 'hover:text-ink'
              }`}
              aria-current={active ? 'step' : undefined}
            >
              <span className={`h-px w-full ${active ? 'bg-hl' : 'bg-rule-strong'}`} />
              <span className={active ? 'text-hl' : 'text-ink-dim'}>{String(index + 1).padStart(2, '0')}</span>
              <span className="truncate">{chapter.label}</span>
            </button>
          );
        })}
      </nav>

      <nav
        className="fixed inset-x-4 bottom-4 z-[65] flex justify-center gap-2 md:hidden"
        aria-label="Crate chapter navigation"
      >
        {chapters.map((chapter, index) => {
          const active = index === currentSection;
          return (
            <button
              key={chapter.id}
              type="button"
              onClick={() => onSectionClick(index)}
              className={`h-2.5 transition-all ${
                active ? 'w-10 bg-ink' : 'w-2.5 bg-paper-3'
              }`}
              aria-label={`Go to ${chapter.label}`}
              aria-current={active ? 'step' : undefined}
            />
          );
        })}
      </nav>
    </>
  );
}

function ChapterControls({
  canGoNext,
  canGoPrev,
  onNext,
  onPrev,
}: {
  canGoNext: boolean;
  canGoPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[66] hidden flex-col border border-rule-strong bg-paper shadow-[0_14px_26px_-22px_rgba(14,13,11,0.65)] md:flex">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoPrev}
        className="flex h-11 w-11 items-center justify-center border-b border-rule text-ink transition-colors hover:bg-paper-2 disabled:text-ink-dim disabled:opacity-35"
        aria-label="Previous crate chapter"
      >
        <ChevronUp className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        className="flex h-11 w-11 items-center justify-center text-ink transition-colors hover:bg-paper-2 disabled:text-ink-dim disabled:opacity-35"
        aria-label="Next crate chapter"
      >
        <ChevronDown className="h-5 w-5" />
      </button>
    </div>
  );
}

function SleeveIntro({
  data,
  releases,
  firstRelease,
  peakMonth,
}: {
  data: WrappedData;
  releases: WrappedRelease[];
  firstRelease?: WrappedRelease;
  peakMonth?: TimelineMonth;
}) {
  const featureCovers = releases.slice(0, 9);

  return (
    <div className="grid w-full min-w-0 items-center gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.82fr)] xl:gap-14">
      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          <span className="text-hl">Wrapped</span>
          <span>{data.isYearToDate ? 'Year to date' : 'Annual crate report'}</span>
        </div>
        <h1 className="text-display text-[clamp(88px,18vw,360px)] uppercase leading-[0.74] text-ink">
          {data.year}
        </h1>
        <p className="mt-7 max-w-[68ch] font-grot text-[17px] leading-[1.65] text-ink-2 md:text-[20px]">
          {data.summary.totalReleases.toLocaleString()} records filed into the collection
          {data.isYearToDate ? ' so far' : ''}, led by {data.summary.topGenre || 'unknown genre'} and a peak
          month of {peakMonth?.month || data.summary.peakMonth || 'unknown'}.
        </p>
        <KpiStrip
          items={[
            { label: 'Records', value: data.summary.totalReleases.toLocaleString(), icon: Library },
            { label: 'Artists', value: data.summary.uniqueArtists.toLocaleString(), icon: Disc3 },
            { label: 'Avg / month', value: data.summary.avgPerMonth.toFixed(1), icon: CalendarDays },
            { label: 'First filed', value: firstRelease ? formatDate(firstRelease.date_added, false) : '-', icon: Grid3X3 },
          ]}
        />
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[min(640px,38vw)] border border-rule-strong bg-paper-2 p-3 shadow-[0_22px_48px_-32px_rgba(14,13,11,0.6)]">
        <div className="absolute -left-4 top-8 hidden h-[calc(100%-4rem)] w-4 border-y border-l border-rule bg-paper-3 sm:block" />
        <div className="grid h-full grid-cols-3 gap-2 overflow-hidden border border-rule bg-paper">
          {featureCovers.map((release, index) => (
            <Link
              key={`${release.slug}-${index}`}
              to={`/album/${release.slug}`}
              className="group relative min-h-0 overflow-hidden bg-paper-2"
              aria-label={`Open ${release.release_name}`}
            >
              <img
                src={getReleaseImage(release, 'medium')}
                alt={release.release_name}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading={index < 3 ? 'eager' : 'lazy'}
                onError={handleImageError}
              />
            </Link>
          ))}
        </div>
        <div className="absolute bottom-3 left-3 right-3 border-t border-rule bg-paper px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">
          Crate face / {String(featureCovers.length).padStart(3, '0')} sleeves
        </div>
      </div>
    </div>
  );
}

function KpiStrip({
  items,
}: {
  items: Array<{ label: string; value: string; icon: ComponentType<{ className?: string }> }>;
}) {
  return (
    <dl className="mt-8 grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong md:max-w-5xl md:grid-cols-4">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="min-w-0 bg-paper p-4 xl:p-5">
          <dt className="mb-4 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">
            <span className="truncate">{label}</span>
            <Icon className="h-3.5 w-3.5 shrink-0 text-hl" />
          </dt>
          <dd className="truncate font-display text-[clamp(28px,3.5vw,56px)] uppercase leading-none text-ink">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function BookendsSection({
  firstRelease,
  lastRelease,
  firstAlbumColors,
  lastAlbumColors,
}: {
  firstRelease?: WrappedRelease;
  lastRelease?: WrappedRelease;
  firstAlbumColors: ColorPalette;
  lastAlbumColors: ColorPalette;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<'first' | 'last'>('first');
  const [isVisible, setIsVisible] = useState(false);
  const activeRelease = active === 'first' ? firstRelease : lastRelease;
  const activeColors = active === 'first' ? firstAlbumColors : lastAlbumColors;

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActive('first');
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActive('last');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVisible]);

  if (!firstRelease || !lastRelease || !activeRelease) {
    return (
      <EmptyChapter
        title="Bookends missing"
        detail="This year does not have enough release data to build a first and last sleeve."
      />
    );
  }

  return (
    <div ref={sectionRef} className="grid w-full min-w-0 items-center gap-8 xl:grid-cols-[minmax(0,0.78fr)_minmax(520px,1fr)] xl:gap-14">
      <div className="min-w-0">
        <ChapterKicker number="02" label="First pull / final file" />
        <h2 className="mt-4 font-display text-[clamp(52px,8.5vw,150px)] uppercase leading-[0.82] text-ink">
          The year has two edges.
        </h2>
        <p className="mt-6 max-w-[58ch] text-[17px] leading-[1.64] text-ink-2 md:text-[19px]">
          The first and last records mark the collection's opening and closing dates. The accent strip is lifted
          from the active sleeve, so the year keeps a trace of its own cover color.
        </p>

        <div className="mt-7 inline-grid grid-cols-2 border border-rule-strong bg-rule-strong font-mono text-[11px] uppercase tracking-[0.1em]">
          <button
            type="button"
            onClick={() => setActive('first')}
            className={`px-4 py-3 transition-colors ${active === 'first' ? 'bg-ink text-paper' : 'bg-paper text-ink-dim hover:text-ink'}`}
          >
            First
          </button>
          <button
            type="button"
            onClick={() => setActive('last')}
            className={`px-4 py-3 transition-colors ${active === 'last' ? 'bg-ink text-paper' : 'bg-paper text-ink-dim hover:text-ink'}`}
          >
            Last
          </button>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
        <div className="relative min-h-[320px] md:min-h-[580px] 2xl:min-h-[640px]">
          <ReleaseSleeve
            release={lastRelease}
            label="Last"
            colors={lastAlbumColors}
            active={active === 'last'}
            className="absolute right-0 top-4 w-[72%] rotate-3"
          />
          <ReleaseSleeve
            release={firstRelease}
            label="First"
            colors={firstAlbumColors}
            active={active === 'first'}
            className="absolute left-0 top-0 w-[76%] -rotate-3"
          />
        </div>

        <div className="flex min-w-0 flex-col justify-between border border-rule-strong bg-paper p-5 xl:p-7">
          <div>
            <div
              className="mb-5 h-2 w-24"
              style={{ backgroundColor: activeColors.accent || 'var(--hl)' }}
            />
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              {active === 'first' ? 'First filed' : 'Final filed'} / {formatDate(activeRelease.date_added)}
            </div>
            <h3 className="mt-4 font-grot text-[clamp(34px,4.5vw,72px)] font-semibold leading-[0.94] tracking-[-0.02em] text-ink">
              <Link to={`/album/${activeRelease.slug}`} className="transition-colors hover:text-hl">
                {activeRelease.release_name}
              </Link>
            </h3>
            <p className="mt-3 text-[18px] text-ink-2 xl:text-[22px]">{activeRelease.release_artist}</p>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {activeRelease.genre_names.slice(0, 4).map((genre) => (
              <GenreTag key={genre} genre={genre} size="sm" linkable />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReleaseSleeve({
  release,
  label,
  colors,
  active,
  className = '',
}: {
  release: WrappedRelease;
  label: string;
  colors: ColorPalette;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      to={`/album/${release.slug}`}
      className={`group block border bg-paper p-2 shadow-[0_24px_52px_-34px_rgba(14,13,11,0.75)] transition-all duration-300 ${
        active ? 'z-20 scale-105 border-ink' : 'z-10 border-rule opacity-70 hover:opacity-100'
      } ${className}`}
      style={{ borderTopColor: colors.accent || 'var(--hl)', borderTopWidth: 6 }}
    >
      <div className="aspect-square overflow-hidden bg-paper-2">
        <img
          src={getReleaseImage(release, 'hi-res')}
          alt={`${release.release_name} by ${release.release_artist}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          onError={handleImageError}
        />
      </div>
      <div className="mt-3 grid grid-cols-[42px_minmax(0,1fr)] gap-3 font-mono text-[10px] uppercase tracking-[0.08em]">
        <span className="text-hl">{label}</span>
        <span className="truncate text-ink-dim">{release.release_artist}</span>
      </div>
    </Link>
  );
}

function MonthlySpineSection({
  timeline,
  peakMonth,
  totalReleases,
}: {
  timeline: TimelineMonth[];
  peakMonth?: TimelineMonth;
  totalReleases: number;
}) {
  const [activeMonthName, setActiveMonthName] = useState(peakMonth?.month || timeline.find((m) => m.count > 0)?.month || timeline[0]?.month);
  const activeMonth = timeline.find((month) => month.month === activeMonthName) || peakMonth || timeline[0];
  const maxCount = Math.max(1, ...timeline.map((month) => month.count));

  return (
    <div className="grid w-full min-w-0 items-center gap-8 xl:grid-cols-[minmax(0,0.72fr)_minmax(620px,1fr)] xl:gap-14">
      <div className="min-w-0">
        <ChapterKicker number="03" label="Monthly tempo" />
        <h2 className="mt-4 font-display text-[clamp(52px,8vw,146px)] uppercase leading-[0.82] text-ink">
          The loudest month was {peakMonth?.month || 'quiet'}.
        </h2>
        <p className="mt-6 max-w-[58ch] text-[17px] leading-[1.64] text-ink-2 md:text-[19px]">
          Each marker is a month in the year, scaled against the busiest filing run and paired with a short
          cover sample from that period.
        </p>
        <div className="mt-7 grid max-w-md grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong">
          <Fact label="Year count" value={totalReleases.toLocaleString()} />
          <Fact label="Selected" value={activeMonth ? String(activeMonth.count).padStart(2, '0') : '00'} />
        </div>
      </div>

      <div className="min-w-0 border border-rule-strong bg-paper p-5 shadow-[0_20px_42px_-34px_rgba(14,13,11,0.55)] xl:p-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 xl:gap-3">
          {timeline.map((month) => {
            const active = month.month === activeMonth?.month;
            const isFutureEmpty = month.count === 0;
            return (
              <button
                key={month.month}
                type="button"
                onClick={() => setActiveMonthName(month.month)}
                className={`group min-w-0 border p-3 text-left transition-colors xl:p-4 ${
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule bg-paper hover:border-rule-strong hover:bg-paper-2'
                }`}
              >
                <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.1em]">
                  <span className="truncate">{month.month.slice(0, 3)}</span>
                  <span className={active ? 'text-hl' : 'text-ink-dim'}>{String(month.count).padStart(2, '0')}</span>
                </div>
                <div className="mt-5 h-2 bg-paper-3">
                  <div
                    className={active ? 'h-full bg-hl' : 'h-full bg-ink'}
                    style={{ width: `${Math.max(3, (month.count / maxCount) * 100)}%`, opacity: isFutureEmpty ? 0.25 : 1 }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 border-t border-rule pt-6">
          {activeMonth && activeMonth.releases.length > 0 ? (
            <MiniCoverStrip releases={activeMonth.releases.slice(0, 8)} label={`${activeMonth.month} releases`} />
          ) : (
            <div className="flex min-h-32 items-center justify-center border border-dashed border-rule bg-paper-2 px-6 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim">
              Nothing filed here yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalsSection({ data }: { data: WrappedData }) {
  const artists = [
    ...data.insights.topArtists,
    ...data.insights.artists.filter(
      (artist) => !data.insights.topArtists.some((topArtist) => topArtist.slug === artist.slug),
    ),
  ].slice(0, 6);
  const maxArtistCount = Math.max(1, ...artists.map((artist) => artist.count));
  const genres = data.insights.genres.slice(0, 6);
  const maxGenreCount = Math.max(1, ...genres.map((genre) => genre.count));

  return (
    <div className="grid w-full min-w-0 items-center gap-8 xl:grid-cols-[minmax(0,0.66fr)_minmax(720px,1.08fr)] xl:gap-14">
      <div className="min-w-0">
        <ChapterKicker number="04" label="Artist and genre signals" />
        <h2 className="mt-4 font-display text-[clamp(52px,8vw,146px)] uppercase leading-[0.82] text-ink">
          The crate found its house style.
        </h2>
        <p className="mt-6 max-w-[58ch] text-[17px] leading-[1.64] text-ink-2 md:text-[19px]">
          A compact read on the names and genres that kept resurfacing. This keeps the data dense and scannable,
          closer to a catalogue card than a slideshow stat blast.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="border border-rule-strong bg-paper p-5 xl:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-rule pb-3">
            <h3 className="font-display text-[clamp(22px,2.4vw,32px)] uppercase leading-none text-ink">Top artists</h3>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">
              {String(artists.length).padStart(2, '0')} cards
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {artists.map((artist, index) => (
              <ArtistSignalCard
                key={artist.slug}
                artist={artist}
                index={index}
                maxCount={maxArtistCount}
              />
            ))}
          </div>
        </div>

        <div className="border border-rule-strong bg-paper p-5 xl:p-6">
          <div className="mb-4 border-b border-rule pb-3">
            <h3 className="font-display text-[clamp(22px,2.4vw,32px)] uppercase leading-none text-ink">Genre pressure</h3>
          </div>
          <ul className="flex flex-col gap-3">
            {genres.map((genre) => (
              <li key={genre.name} className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-3">
                <div className="min-w-0">
                  <GenreTag genre={genre.name} size="sm" linkable />
                  <div className="mt-2 h-2 bg-paper-2">
                    <div
                      className="h-full bg-ink"
                      style={{ width: `${(genre.count / maxGenreCount) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-right font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
                  {genre.percentage.toFixed(0)}%
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ArtistSignalCard({
  artist,
  index,
  maxCount,
}: {
  artist: TopArtist;
  index: number;
  maxCount: number;
}) {
  const image = artist.images?.['hi-res'] || artist.images?.medium || artist.images?.avatar;

  return (
    <Link to={`/artist/${artist.slug}`} className="group min-w-0">
      <div className="relative aspect-square overflow-hidden border border-rule bg-paper-2">
        {image ? (
          <img
            src={getWrappedImageUrl(image)}
            alt={artist.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={handleImageError}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-[32px] uppercase text-ink-dim">
            {artist.name.slice(0, 2)}
          </div>
        )}
        <div className="absolute left-2 top-2 bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-hl">
          {String(index + 1).padStart(2, '0')}
        </div>
      </div>
      <div className="mt-2 truncate font-grot text-[14px] font-semibold text-ink transition-colors group-hover:text-hl">
        {artist.name}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-1.5 flex-1 bg-paper-2">
          <span className="block h-full bg-ink" style={{ width: `${(artist.count / maxCount) * 100}%` }} />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">{artist.count}</span>
      </div>
    </Link>
  );
}

function CrateShelvesSection({
  months,
  peakMonth,
}: {
  months: TimelineMonth[];
  peakMonth?: TimelineMonth;
}) {
  const [activeMonthName, setActiveMonthName] = useState(peakMonth?.count ? peakMonth.month : months[0]?.month);
  const activeMonth = months.find((month) => month.month === activeMonthName) || months[0];

  if (!activeMonth) {
    return (
      <EmptyChapter
        title="No shelves yet"
        detail="This year does not have any monthly release shelves to browse."
      />
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-center gap-6 overflow-hidden">
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.58fr)_minmax(720px,1fr)] xl:items-end xl:gap-12">
        <div className="min-w-0">
          <ChapterKicker number="05" label="Pull through the shelves" />
          <h2 className="mt-4 font-display text-[clamp(52px,7.5vw,132px)] uppercase leading-[0.82] text-ink">
            Browse the month as a record bin.
          </h2>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end">
          {months.map((month) => {
            const active = month.month === activeMonth.month;
            return (
              <button
                key={month.month}
                type="button"
                onClick={() => setActiveMonthName(month.month)}
                className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule bg-paper text-ink-dim hover:border-rule-strong hover:text-ink'
                }`}
              >
                {month.month.slice(0, 3)} / {String(month.count).padStart(2, '0')}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 border border-rule-strong bg-paper p-5 shadow-[0_20px_42px_-34px_rgba(14,13,11,0.55)] xl:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
          <h3 className="font-display text-[clamp(24px,3vw,40px)] uppercase leading-none text-ink">{activeMonth.month}</h3>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">
            {String(activeMonth.count).padStart(3, '0')} records
          </span>
        </div>
        <DragWall
          ariaLabel={`${activeMonth.month} wrapped shelf`}
          itemBasis="min(28vw, 300px)"
          gapClass="gap-4"
          showScrollbar
        >
          {activeMonth.releases.map((release, index) => (
            <ShelfRecordCard key={`${release.slug}-${index}`} release={release} index={index} />
          ))}
        </DragWall>
      </div>
    </div>
  );
}

function ShelfRecordCard({ release, index }: { release: WrappedRelease; index: number }) {
  return (
    <Link to={`/album/${release.slug}`} className="group block min-w-0">
      <div className="aspect-square overflow-hidden border border-rule-strong bg-paper-2">
        <img
          src={getReleaseImage(release, 'medium')}
          alt={`${release.release_name} by ${release.release_artist}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          onError={handleImageError}
        />
      </div>
      <div className="mt-3 flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
        <span className="text-hl">{String(index + 1).padStart(2, '0')}</span>
        <span>{formatDate(release.date_added, false)}</span>
      </div>
      <div className="mt-1 truncate font-grot text-[15px] font-semibold leading-tight text-ink transition-colors group-hover:text-hl">
        {release.release_name}
      </div>
      <div className="truncate text-[13px] text-ink-3">{release.release_artist}</div>
    </Link>
  );
}

function YearNavigationCrate({
  currentYear,
  isYearToDate,
  availableYears,
  previousYear,
  nextYear,
  totalReleases,
}: {
  currentYear: number;
  isYearToDate: boolean;
  availableYears: number[];
  previousYear?: number;
  nextYear?: number;
  totalReleases: number;
}) {
  return (
    <div className="grid w-full min-w-0 items-center gap-8 xl:grid-cols-[minmax(0,0.82fr)_minmax(520px,0.92fr)] xl:gap-14">
      <div className="min-w-0">
        <ChapterKicker number="06" label="File this year" />
        <h2 className="mt-4 font-display text-[clamp(60px,10vw,180px)] uppercase leading-[0.78] text-ink">
          {currentYear} stays in the crate.
        </h2>
        <p className="mt-6 max-w-[58ch] text-[17px] leading-[1.64] text-ink-2 md:text-[19px]">
          {isYearToDate ? 'The year is still being filed.' : 'The year is filed.'} Neighboring years sit nearby,
          with the full dossier still holding the detailed catalogue view.
        </p>
      </div>

      <div className="border border-rule-strong bg-paper p-5 xl:p-7">
        <div className="mb-5 grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong">
          <Fact label="Current year" value={String(currentYear)} />
          <Fact label="Records" value={totalReleases.toLocaleString()} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <YearJump year={previousYear} label="Previous year" />
          <YearJump year={nextYear} label="Next year" />
        </div>

        <div className="mt-5 border-t border-rule pt-5">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">All wrapped years</div>
          <div className="grid grid-cols-3 gap-[1px] border border-rule bg-rule sm:grid-cols-4">
            {availableYears.map((year) => (
              <Link
                key={year}
                to={`/wrapped/${year}`}
                className={`bg-paper px-3 py-3 text-center font-mono text-[11px] uppercase tracking-[0.08em] transition-colors hover:bg-ink hover:text-paper ${
                  year === currentYear ? 'text-hl' : 'text-ink-dim'
                }`}
              >
                {year}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function YearJump({ year, label }: { year?: number; label: string }) {
  if (!year) {
    return (
      <div className="border border-rule bg-paper-2 px-4 py-4 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim opacity-60">
        {label}
      </div>
    );
  }

  return (
    <Link
      to={`/wrapped/${year}`}
      className="group border border-rule-strong bg-paper px-4 py-4 transition-colors hover:bg-ink hover:text-paper"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim group-hover:text-paper">
        {label}
      </div>
      <div className="mt-2 font-display text-[clamp(34px,3.4vw,62px)] uppercase leading-none">{year}</div>
    </Link>
  );
}

function MiniCoverStrip({ releases, label }: { releases: WrappedRelease[]; label: string }) {
  return (
    <div aria-label={label} className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {releases.map((release, index) => (
        <Link
          key={`${release.slug}-${index}`}
          to={`/album/${release.slug}`}
          className="group aspect-square overflow-hidden border border-rule bg-paper-2"
          aria-label={`Open ${release.release_name}`}
        >
          <img
            src={getReleaseImage(release, 'medium')}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={handleImageError}
          />
        </Link>
      ))}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-paper p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">{label}</div>
      <div className="mt-2 truncate font-display text-[clamp(28px,3.4vw,58px)] uppercase leading-none text-ink">{value}</div>
    </div>
  );
}

function ChapterKicker({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
      <span className="text-hl">{number}</span>
      <span>{label}</span>
    </div>
  );
}

function EmptyChapter({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto max-w-xl border border-rule-strong bg-paper p-8 text-center">
      <h2 className="font-display text-[clamp(34px,7vw,72px)] uppercase leading-[0.9] text-ink">{title}</h2>
      <p className="mt-5 text-[16px] leading-[1.65] text-ink-2">{detail}</p>
    </div>
  );
}

function getReleaseImage(release: WrappedRelease, size: 'hi-res' | 'medium'): string {
  const src = size === 'hi-res'
    ? release.images['hi-res'] || release.images.medium
    : release.images.medium || release.images['hi-res'];
  return getWrappedImageUrl(src);
}

function getWrappedImageUrl(src?: string): string {
  return src ? migrateImageUri(src) : '';
}

function formatDate(date: string, includeYear = true): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '-';

  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: includeYear ? 'numeric' : undefined,
  }).toUpperCase();
}
