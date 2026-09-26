import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { PresentationContainer, PresentationSection } from './components/presentation/PresentationContainer';
import { useWrappedNavigation } from './hooks/useWrappedNavigation';
import { Logo } from '@/components/Logo';
import { ArtistCard } from '@/components/ArtistCard';
import { HeroRecord, RecordTile } from '@/components/player';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { getAlbumImageFromData, getArtistImageFromData, handleImageError } from '@/lib/image-utils';
import { slugify } from '@/lib/browseFacets';
import { GROUND, CREAM, NEUTRAL_FLOOD, inkOn, subInk, type Flood } from '@/lib/sleeveColour';
import type { WrappedData, WrappedRelease } from '@/types/wrapped';
import {
  artistUri,
  floodForRelease,
  formatDay,
  groupColour,
  paletteForRelease,
  paletteForSlug,
  releaseUri,
  tileAlbum,
  type ColourMap,
} from './utils/sleeves';

interface WrappedPresentationProps {
  data: WrappedData;
  availableYears: number[];
  previousYear?: number;
  nextYear?: number;
}

type TimelineMonth = WrappedData['insights']['timeline'][number];
type TopArtist = WrappedData['insights']['topArtists'][number] | WrappedData['insights']['artists'][number];

const CHAPTERS = [
  { id: 'overview', label: 'Overview' },
  { id: 'first-last', label: 'First & last' },
  { id: 'months', label: 'Months' },
  { id: 'artists', label: 'Artists' },
  { id: 'shelves', label: 'Shelves' },
  { id: 'years', label: 'Years' },
];

const GROUND_FLOOD: Flood = { flood: GROUND, ink: CREAM, sub: subInk(CREAM), ground: GROUND, glow: CREAM, secondary: null };

/** Solid colour flood as a Flood, with readable ink. */
function solid(colour: string): Flood {
  const ink = inkOn(colour);
  return { flood: colour, ink, sub: subInk(ink), ground: GROUND, glow: colour, secondary: null };
}

/**
 * Full-screen, snap-scrolling run through a year. Each chapter floods with
 * a colour from the records it shows (the first sleeve, the selected
 * month); colour changes fade and motion respects prefers-reduced-motion.
 */
export function WrappedPresentation({ data, availableYears, previousYear, nextYear }: WrappedPresentationProps) {
  const colours = useAlbumColorMap();

  const sortedReleases = useMemo(
    () => data.releases.map(r => r.release).sort((a, b) => new Date(a.date_added).getTime() - new Date(b.date_added).getTime()),
    [data.releases],
  );
  const firstRelease = sortedReleases[0];
  const lastRelease = sortedReleases[sortedReleases.length - 1];

  const monthsWithReleases = useMemo(() => data.insights.timeline.filter(m => m.count > 0), [data.insights.timeline]);

  const peakMonth = useMemo(() => {
    const namedPeak = data.insights.timeline.find(m => m.month === data.summary.peakMonth && m.count > 0);
    if (namedPeak) return namedPeak;
    return [...data.insights.timeline].sort((a, b) => b.count - a.count)[0];
  }, [data.insights.timeline, data.summary.peakMonth]);

  const monthColour = useMemo(() => {
    const used = new Set<string>();
    return Object.fromEntries(data.insights.timeline.map(m => [m.month, groupColour(m.releases, colours, used)])) as Record<string, string>;
  }, [data.insights.timeline, colours]);

  const navigation = useWrappedNavigation({ totalSections: CHAPTERS.length });

  // Shared selection between the Months and Shelves chapters.
  const [activeMonthName, setActiveMonthName] = useState(peakMonth?.count ? peakMonth.month : monthsWithReleases[0]?.month);

  const [bookend, setBookend] = useState<'first' | 'last'>('first');
  const overviewFlood = floodForRelease(colours, firstRelease);
  const bookendFlood = floodForRelease(colours, bookend === 'first' ? firstRelease : lastRelease);
  const activeMonth = data.insights.timeline.find(m => m.month === activeMonthName) ?? peakMonth;
  const monthFlood = activeMonth ? solid(monthColour[activeMonth.month] ?? NEUTRAL_FLOOD) : GROUND_FLOOD;

  const floods = [overviewFlood, bookendFlood, GROUND_FLOOD, GROUND_FLOOD, monthFlood, GROUND_FLOOD];

  return (
    <div id="wrapped-presentation" className="fixed inset-0 z-50 overflow-hidden bg-[var(--ground)] text-[color:var(--cream)]">
      <Link
        to="/"
        className="fixed left-3 top-3 z-[70] inline-flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(14,13,12,.78)] text-[color:var(--cream)] backdrop-blur-md md:left-5 md:top-4"
        aria-label="Go to homepage"
      >
        <Logo className="h-8 w-8" />
      </Link>

      <ChapterRail currentSection={navigation.currentSection} onSectionClick={navigation.goToSection} />
      <ChapterControls
        canGoNext={navigation.canGoNext}
        canGoPrev={navigation.canGoPrev}
        onNext={navigation.nextSection}
        onPrev={navigation.prevSection}
      />

      <PresentationContainer ref={navigation.containerRef} onScroll={navigation.handleScroll} className="relative z-10 h-[100dvh]">
        {CHAPTERS.map((chapter, i) => (
          <PresentationSection
            key={chapter.id}
            id={`wrapped-${chapter.id}`}
            aria-label={chapter.label}
            className="flood-surface h-[100dvh] min-h-[100dvh] items-stretch justify-stretch"
            style={{ background: floods[i].flood, color: floods[i].ink }}
          >
            <ChapterFrame>
              {chapter.id === 'overview' && (
                <Overview data={data} releases={sortedReleases} flood={overviewFlood} peakMonth={peakMonth} />
              )}
              {chapter.id === 'first-last' && (
                <FirstLast
                  firstRelease={firstRelease}
                  lastRelease={lastRelease}
                  active={bookend}
                  onChange={setBookend}
                  flood={bookendFlood}
                />
              )}
              {chapter.id === 'months' && (
                <Months
                  timeline={data.insights.timeline}
                  peakMonth={peakMonth}
                  activeMonth={activeMonth}
                  onSelect={setActiveMonthName}
                  monthColour={monthColour}
                />
              )}
              {chapter.id === 'artists' && <ArtistsAndGenres data={data} releases={sortedReleases} colours={colours} />}
              {chapter.id === 'shelves' && (
                <Shelves
                  months={monthsWithReleases}
                  activeMonth={activeMonth}
                  onSelect={setActiveMonthName}
                  flood={monthFlood}
                  colours={colours}
                />
              )}
              {chapter.id === 'years' && (
                <Years
                  currentYear={data.year}
                  isYearToDate={data.isYearToDate}
                  availableYears={availableYears}
                  previousYear={previousYear}
                  nextYear={nextYear}
                  totalReleases={data.summary.totalReleases}
                  flood={overviewFlood}
                />
              )}
            </ChapterFrame>
          </PresentationSection>
        ))}
      </PresentationContainer>
    </div>
  );
}

// ---------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------

function ChapterFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-stretch px-5 pb-20 pt-20 sm:px-8 md:pb-14 md:pt-24 lg:pl-44 lg:pr-12 2xl:pl-52">
      <div className="mx-auto flex h-full w-full min-w-0 max-w-[1640px] items-center">{children}</div>
    </div>
  );
}

function ChapterRail({ currentSection, onSectionClick }: { currentSection: number; onSectionClick: (index: number) => void }) {
  return (
    <>
      <nav
        className="fixed left-5 top-1/2 z-[65] hidden -translate-y-1/2 flex-col gap-1 rounded-3xl bg-[rgba(14,13,12,.78)] p-2 text-[color:var(--cream)] backdrop-blur-md lg:flex"
        aria-label="Chapters"
      >
        {CHAPTERS.map((chapter, index) => {
          const active = index === currentSection;
          return (
            <button
              key={chapter.id}
              type="button"
              onClick={() => onSectionClick(index)}
              className={`flex min-h-[44px] w-32 items-center gap-3 rounded-full px-3 text-left text-[13px] font-bold transition-colors ${
                active ? 'bg-[var(--cream)] text-[color:var(--ground)]' : 'text-[color:var(--cream-dim)] hover:text-[color:var(--cream)]'
              }`}
              aria-current={active ? 'step' : undefined}
            >
              <span className="t-mono text-[11px]">{String(index + 1).padStart(2, '0')}</span>
              <span className="truncate">{chapter.label}</span>
            </button>
          );
        })}
      </nav>

      <nav
        className="fixed bottom-3 left-1/2 z-[65] flex -translate-x-1/2 items-center rounded-full bg-[rgba(14,13,12,.78)] px-1 backdrop-blur-md lg:hidden"
        aria-label="Chapters"
      >
        {CHAPTERS.map((chapter, index) => {
          const active = index === currentSection;
          return (
            <button
              key={chapter.id}
              type="button"
              onClick={() => onSectionClick(index)}
              className="flex h-11 w-9 items-center justify-center"
              aria-label={`Go to ${chapter.label}`}
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={`block h-2.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                  active ? 'w-6 bg-[var(--cream)]' : 'w-2.5 bg-[color:var(--cream-rule)]'
                }`}
              />
            </button>
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
    <div className="fixed bottom-4 right-5 z-[66] hidden flex-col gap-2 md:flex">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoPrev}
        className="icon-btn bg-[rgba(14,13,12,.78)] text-[color:var(--cream)] backdrop-blur-md disabled:opacity-35"
        aria-label="Previous chapter"
      >
        <ChevronUp className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        className="icon-btn bg-[rgba(14,13,12,.78)] text-[color:var(--cream)] backdrop-blur-md disabled:opacity-35"
        aria-label="Next chapter"
      >
        <ChevronDown className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------

function Overview({
  data,
  releases,
  flood,
  peakMonth,
}: {
  data: WrappedData;
  releases: WrappedRelease[];
  flood: Flood;
  peakMonth?: TimelineMonth;
}) {
  const covers = releases.slice(0, 9);
  return (
    <div className="grid w-full min-w-0 items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] xl:gap-16">
      <div className="min-w-0">
        <div className="t-kicker" style={{ color: flood.sub }}>
          Wrapped{data.isYearToDate ? ' · Year to date' : ''}
        </div>
        <h1 className="t-disp m-0 mt-3 text-[clamp(88px,17vw,300px)]">{data.year}</h1>
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
          <Stat label="Records" value={data.summary.totalReleases.toLocaleString('en-GB')} sub={flood.sub} />
          <Stat label="Artists" value={data.summary.uniqueArtists.toLocaleString('en-GB')} sub={flood.sub} />
          <Stat label="Per month" value={data.summary.avgPerMonth.toFixed(1)} sub={flood.sub} />
          <Stat label="Busiest" value={(peakMonth?.month || data.summary.peakMonth || '—').slice(0, 3)} sub={flood.sub} />
        </dl>
      </div>

      <div className="mx-auto hidden w-full max-w-[min(560px,40vw)] sm:block lg:max-w-[min(620px,38vw)]">
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {covers.map((release, index) => (
            <Link
              key={`${release.slug}-${index}`}
              to={releaseUri(release.slug)}
              className="tile aspect-square rounded-md shadow-[0_18px_40px_-18px_rgba(0,0,0,.6)]"
              aria-label={`${release.release_name} by ${release.release_artist}`}
            >
              <img
                src={getAlbumImageFromData(releaseUri(release.slug), 'medium')}
                alt=""
                loading={index < 3 ? 'eager' : 'lazy'}
                onError={handleImageError}
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function FirstLast({
  firstRelease,
  lastRelease,
  active,
  onChange,
  flood,
}: {
  firstRelease?: WrappedRelease;
  lastRelease?: WrappedRelease;
  active: 'first' | 'last';
  onChange: (next: 'first' | 'last') => void;
  flood: Flood;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const release = active === 'first' ? firstRelease : lastRelease;

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0.6 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onChange('first');
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onChange('last');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVisible, onChange]);

  if (!firstRelease || !lastRelease || !release) {
    return <EmptyChapter title="First & last" detail="Not enough records this year." />;
  }

  const uri = releaseUri(release.slug);
  const artist = release.artists[0];

  return (
    <div ref={sectionRef} className="grid w-full min-w-0 items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-16">
      <div className="min-w-0">
        <div className="flex gap-2" role="group" aria-label="Show first or last record">
          {(['first', 'last'] as const).map(key => {
            const on = key === active;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                aria-pressed={on}
                className={`pill ${on ? 'pill-solid' : ''}`}
                style={on ? { background: flood.ink, color: flood.flood } : undefined}
              >
                {key === 'first' ? 'First' : 'Last'}
              </button>
            );
          })}
        </div>
        <div className="t-mono mt-8 text-[12px] font-bold uppercase" style={{ color: flood.sub }}>
          {active === 'first' ? 'First added' : 'Last added'} · {formatDay(release.date_added)}
        </div>
        <Link to={uri} className="t-cond mt-3 block text-[clamp(40px,6vw,108px)] hover:underline">
          {release.release_name}
        </Link>
        {artist ? (
          <Link to={artistUri(artist.slug)} className="t-dispn mt-3 inline-block text-[20px] hover:underline md:text-[28px]">
            {release.release_artist}
          </Link>
        ) : (
          <div className="t-dispn mt-3 text-[20px] md:text-[28px]">{release.release_artist}</div>
        )}
        {release.genre_names.length > 0 && (
          <ul className="m-0 mt-8 flex list-none flex-wrap gap-2 p-0">
            {release.genre_names.slice(0, 4).map(g => (
              <li key={g}>
                <Link to={`/genre/${slugify(g)}`} className="pill pill-sm">
                  {g}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mx-auto hidden w-[78%] max-w-[560px] md:block">
        <HeroRecord
          key={release.slug}
          src={getAlbumImageFromData(uri, 'hi-res')}
          alt={`${release.release_name} by ${release.release_artist}`}
          labelColour={flood.ground}
          discOut={22}
          eager={false}
          sticker={{ date: release.date_added, background: flood.ink, color: flood.flood, label: active === 'first' ? 'First' : 'Last' }}
        />
      </div>
    </div>
  );
}

function Months({
  timeline,
  peakMonth,
  activeMonth,
  onSelect,
  monthColour,
}: {
  timeline: TimelineMonth[];
  peakMonth?: TimelineMonth;
  activeMonth?: TimelineMonth;
  onSelect: (month: string) => void;
  monthColour: Record<string, string>;
}) {
  const max = Math.max(1, ...timeline.map(m => m.count));
  return (
    <div className="grid w-full min-w-0 items-center gap-8 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] xl:gap-16">
      <div className="min-w-0">
        <div className="t-kicker text-[color:var(--cream-dim)]">Busiest month</div>
        <div className="t-cond mt-3 text-[clamp(72px,11vw,200px)]">{peakMonth?.month ?? '—'}</div>
        <div className="t-mono mt-3 text-[13px] text-[color:var(--cream-dim)]">{peakMonth ? `${peakMonth.count} records` : ''}</div>
      </div>

      <div className="min-w-0">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:gap-3">
          {timeline.map(month => {
            const on = month.month === activeMonth?.month;
            const colour = monthColour[month.month] ?? NEUTRAL_FLOOD;
            return (
              <button
                key={month.month}
                type="button"
                onClick={() => onSelect(month.month)}
                disabled={month.count === 0}
                aria-pressed={on}
                aria-label={`${month.month}, ${month.count} records`}
                className="flood-surface flex min-h-[72px] min-w-0 flex-col justify-between rounded-2xl p-2.5 text-left disabled:opacity-40 md:min-h-[92px] md:p-3"
                style={on ? { background: colour, color: inkOn(colour) } : { background: 'var(--ground-2)', color: 'var(--cream)' }}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="t-mono text-[11px] font-bold uppercase">{month.month.slice(0, 3)}</span>
                  <span className="t-mono text-[11px] tabular-nums opacity-75">{month.count}</span>
                </span>
                <span className="mt-3 block h-2 overflow-hidden rounded-full" style={{ background: on ? 'rgba(0,0,0,.18)' : 'var(--ground-3)' }}>
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.max(4, (month.count / max) * 100)}%`, background: on ? inkOn(colour) : colour }}
                  />
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          {activeMonth && activeMonth.releases.length > 0 ? (
            <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0 sm:grid-cols-8" aria-label={`${activeMonth.month} records`}>
              {activeMonth.releases.slice(0, 8).map((release, index) => (
                <li key={`${release.slug}-${index}`}>
                  <Link
                    to={releaseUri(release.slug)}
                    className="tile aspect-square rounded-md"
                    aria-label={`${release.release_name} by ${release.release_artist}`}
                  >
                    <img src={getAlbumImageFromData(releaseUri(release.slug), 'medium')} alt="" loading="lazy" onError={handleImageError} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="t-mono flex min-h-24 items-center justify-center rounded-2xl bg-[var(--ground-2)] px-6 text-center text-[12px] uppercase text-[color:var(--cream-dim)]">
              No records
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ArtistsAndGenres({ data, releases, colours }: { data: WrappedData; releases: WrappedRelease[]; colours: ColourMap }) {
  const artists: TopArtist[] = [
    ...data.insights.topArtists,
    ...data.insights.artists.filter(a => !data.insights.topArtists.some(t => t.slug === a.slug)),
  ].slice(0, 6);
  const genres = data.insights.genres.slice(0, 6);
  const maxGenre = Math.max(1, ...genres.map(g => g.count));
  const used = new Set<string>();
  const genreColour = Object.fromEntries(
    genres.map(g => [g.name, groupColour(releases.filter(r => r.genre_names.includes(g.name)), colours, used)]),
  ) as Record<string, string>;

  const artistPalette = (artist: TopArtist) => {
    const topAlbum = 'topAlbum' in artist ? artist.topAlbum : undefined;
    return (
      (topAlbum ? paletteForSlug(colours, topAlbum.slug) : null) ??
      paletteForRelease(colours, releases.find(r => r.artists.some(a => a.slug === artist.slug)))
    );
  };

  return (
    <div className="grid w-full min-w-0 items-center gap-10 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:gap-16">
      <div className="min-w-0">
        <h2 className="t-disp m-0 text-[32px] md:text-[48px]">Top artists</h2>
        <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-4 md:gap-x-5 md:gap-y-6">
          {artists.map(a => (
            <ArtistCard
              key={a.slug}
              artist={{
                name: a.name,
                uri: artistUri(a.slug),
                albumCount: a.count,
                image: getArtistImageFromData(artistUri(a.slug), 'medium'),
              }}
              palette={artistPalette(a)}
              className="[&_h3]:text-[12px] md:[&_h3]:text-[15px]"
            />
          ))}
        </div>
      </div>

      <div className="min-w-0">
        <h2 className="t-disp m-0 text-[32px] md:text-[48px]">Genres</h2>
        <ul className="m-0 mt-6 flex list-none flex-col gap-3 p-0">
          {genres.map(g => (
            <li key={g.name}>
              <Link to={`/genre/${slugify(g.name)}`} className="group block min-h-[44px] rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cream)]">
                <span className="flex items-baseline justify-between gap-4">
                  <span className="truncate text-[16px] font-bold">{g.name}</span>
                  <span className="t-mono text-[12px] tabular-nums text-[color:var(--cream-dim)]">
                    {g.count} · {g.percentage.toFixed(0)}%
                  </span>
                </span>
                <span className="mt-2 block h-3 overflow-hidden rounded-full bg-[var(--ground-3)]">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(g.count / maxGenre) * 100}%`, background: genreColour[g.name] ?? NEUTRAL_FLOOD }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Shelves({
  months,
  activeMonth,
  onSelect,
  flood,
  colours,
}: {
  months: TimelineMonth[];
  activeMonth?: TimelineMonth;
  onSelect: (month: string) => void;
  flood: Flood;
  colours: ColourMap;
}) {
  const current = activeMonth && activeMonth.releases.length > 0 ? activeMonth : months[0];
  if (!current) return <EmptyChapter title="Shelves" detail="No records this year." />;

  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-center gap-6 overflow-hidden">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h2 className="t-disp m-0 text-[clamp(44px,7vw,112px)]">{current.month}</h2>
          <div className="t-mono mt-2 text-[12px] uppercase" style={{ color: flood.sub }}>
            {current.releases.length} {current.releases.length === 1 ? 'record' : 'records'}
          </div>
        </div>
        <div className="shelf-scroll -mx-5 min-w-0 max-w-full gap-2 px-5 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Choose a month">
          {months.map(month => {
            const on = month.month === current.month;
            return (
              <button
                key={month.month}
                type="button"
                onClick={() => onSelect(month.month)}
                aria-pressed={on}
                className={`pill pill-sm shrink-0 ${on ? 'pill-solid' : ''}`}
                style={on ? { background: flood.ink, color: flood.flood } : undefined}
              >
                <span className="t-mono">{month.month.slice(0, 3)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="shelf-scroll -mx-5 gap-5 px-5 pb-4 pt-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0" aria-label={`${current.month} records`}>
        {current.releases.map((release, index) => (
          <ShelfTile key={`${release.slug}-${index}`} release={release} colours={colours} ink={flood.ink} sub={flood.sub} />
        ))}
      </div>
    </div>
  );
}

function ShelfTile({ release, colours, ink, sub }: { release: WrappedRelease; colours: ColourMap; ink: string; sub: string }) {
  // RecordTile paints its text in cream-dim; on a flood we override with the flood's ink.
  const style = { color: ink, '--cream-dim': sub } as CSSProperties;
  return (
    <div className="w-[150px] shrink-0 md:w-[220px]" style={style}>
      <RecordTile album={tileAlbum(release)} palette={paletteForRelease(colours, release)} meta={formatDay(release.date_added, false)} />
    </div>
  );
}

function Years({
  currentYear,
  isYearToDate,
  availableYears,
  previousYear,
  nextYear,
  totalReleases,
  flood,
}: {
  currentYear: number;
  isYearToDate: boolean;
  availableYears: number[];
  previousYear?: number;
  nextYear?: number;
  totalReleases: number;
  flood: Flood;
}) {
  return (
    <div className="grid w-full min-w-0 items-center gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-16">
      <div className="min-w-0">
        <div className="t-kicker text-[color:var(--cream-dim)]">{isYearToDate ? 'Year to date' : 'Year'}</div>
        <div className="t-disp mt-3 text-[clamp(88px,15vw,260px)]">{currentYear}</div>
        <div className="t-mono mt-3 text-[13px] text-[color:var(--cream-dim)]">{totalReleases.toLocaleString('en-GB')} records</div>
        <div className="mt-8 flex flex-wrap gap-3">
          {previousYear && (
            <Link to={`/wrapped/${previousYear}`} className="pill pill-lg" aria-label={`Previous year, ${previousYear}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {previousYear}
            </Link>
          )}
          {nextYear && (
            <Link
              to={`/wrapped/${nextYear}`}
              className="pill pill-lg pill-solid"
              style={{ background: flood.flood, color: flood.ink }}
              aria-label={`Next year, ${nextYear}`}
            >
              {nextYear}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      <nav aria-label="All Wrapped years" className="min-w-0">
        <h2 className="t-disp m-0 text-[28px] md:text-[40px]">All years</h2>
        <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {availableYears.map(year => {
            const on = year === currentYear;
            return (
              <Link
                key={year}
                to={`/wrapped/${year}`}
                aria-current={on ? 'page' : undefined}
                className={`pill t-mono ${on ? 'pill-solid' : 'border-[color:var(--cream-rule)] text-[color:var(--cream-dim)] hover:text-[color:var(--cream)]'}`}
                style={on ? { background: flood.flood, color: flood.ink } : undefined}
              >
                {year}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-2">
      <dt className="t-mono text-[11px] font-bold uppercase" style={{ color: sub }}>
        {label}
      </dt>
      <dd className="t-cond m-0 truncate text-[clamp(44px,6vw,96px)] tabular-nums">{value}</dd>
    </div>
  );
}

function EmptyChapter({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <h2 className="t-disp m-0 text-[clamp(34px,7vw,72px)]">{title}</h2>
      <p className="t-mono mt-5 text-[13px] text-[color:var(--cream-dim)]">{detail}</p>
    </div>
  );
}
