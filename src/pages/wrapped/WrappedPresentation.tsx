import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { PresentationContainer, PresentationSection } from './components/presentation/PresentationContainer';
import { useWrappedNavigation } from './hooks/useWrappedNavigation';
import { FitTitle, HeroRecord, RecordTile, Sleeve, SpinningMark, Vinyl } from '@/components/player';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { getAlbumImageFromData, getArtistAvatarFromData, getArtistImageFromData, handleImageError } from '@/lib/image-utils';
import { slugify } from '@/lib/browseFacets';
import { GROUND, CREAM, INK, inkOn, subInk, type Flood } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import type { WrappedData, WrappedRelease } from '@/types/wrapped';
import {
  artistUri,
  floodForRelease,
  formatDay,
  groupColour,
  paletteForRelease,
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

/** The year as a record: side A is the year itself, side B who and what. */
const CHAPTERS = [
  { id: 'overview', track: 'A1', label: 'Overview' },
  { id: 'first-last', track: 'A2', label: 'First & last' },
  { id: 'months', track: 'A3', label: 'Months' },
  { id: 'shelves', track: 'A4', label: 'Shelves' },
  { id: 'artists', track: 'B1', label: 'Artists' },
  { id: 'genres', track: 'B2', label: 'Genres' },
  { id: 'years', track: 'B3', label: 'Years' },
] as const;

/** How long each chapter plays for when the transport is playing. */
const PLAY_MS = 9000;
const DAY_MS = 86_400_000;

const GROUND_FLOOD: Flood = { flood: GROUND, ink: CREAM, sub: subInk(CREAM), ground: GROUND, glow: CREAM, secondary: null };

/** Solid colour flood as a Flood, with readable ink. */
function solid(colour: string): Flood {
  const ink = inkOn(colour);
  return { flood: colour, ink, sub: subInk(ink), ground: GROUND, glow: colour, secondary: null };
}

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Full-screen, snap-scrolling run through a year, played like a record: each
 * chapter is a track (A1…B3) on a transport bar, the chapter's lead sleeve
 * spins on the mini record, and every chapter floods with colour from the
 * records it shows. Entrances play the first time a chapter comes round;
 * discs spin and conveyors run only in the visible chapter, and all of it
 * stands still under prefers-reduced-motion.
 */
export function WrappedPresentation({ data, availableYears, previousYear, nextYear }: WrappedPresentationProps) {
  const colours = useAlbumColorMap();

  const releases = useMemo(
    () => data.releases.map(r => r.release).sort((a, b) => new Date(a.date_added).getTime() - new Date(b.date_added).getTime()),
    [data.releases],
  );
  const firstRelease = releases[0];
  const lastRelease = releases[releases.length - 1];

  const monthsWithReleases = useMemo(() => data.insights.timeline.filter(m => m.count > 0), [data.insights.timeline]);
  const peakMonth = useMemo(() => {
    const named = data.insights.timeline.find(m => m.month === data.summary.peakMonth && m.count > 0);
    return named ?? [...data.insights.timeline].sort((a, b) => b.count - a.count)[0];
  }, [data.insights.timeline, data.summary.peakMonth]);

  const monthColour = useMemo(() => {
    const used = new Set<string>();
    return Object.fromEntries(data.insights.timeline.map(m => [m.month, groupColour(m.releases, colours, used)])) as Record<string, string>;
  }, [data.insights.timeline, colours]);

  const artists = useMemo<TopArtist[]>(
    () =>
      [
        ...data.insights.topArtists,
        ...data.insights.artists.filter(a => !data.insights.topArtists.some(t => t.slug === a.slug)),
      ].slice(0, 6),
    [data.insights.topArtists, data.insights.artists],
  );

  // The release that stands for an artist: their top album, else their first of the year.
  const artistLead = useCallback(
    (artist?: TopArtist) => {
      if (!artist) return undefined;
      const top = 'topAlbum' in artist ? artist.topAlbum?.slug : undefined;
      return releases.find(r => r.slug === top) ?? releases.find(r => r.artists.some(a => a.slug === artist.slug));
    },
    [releases],
  );

  const genres = useMemo(() => {
    const used = new Set<string>();
    return data.insights.genres.slice(0, 6).map(g => {
      const withGenre = releases.filter(r => r.genre_names.includes(g.name));
      return { ...g, colour: groupColour(withGenre, colours, used), lead: withGenre[0] };
    });
  }, [data.insights.genres, releases, colours]);

  const navigation = useWrappedNavigation({ totalSections: CHAPTERS.length });
  const current = navigation.currentSection;

  // Chapters play their entrance the first time they come round.
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  useEffect(() => {
    setSeen(prev => (prev.has(current) ? prev : new Set(prev).add(current)));
  }, [current]);

  // Months and Shelves share the selected month.
  const [activeMonthName, setActiveMonthName] = useState(peakMonth?.count ? peakMonth.month : monthsWithReleases[0]?.month);
  const activeMonth = data.insights.timeline.find(m => m.month === activeMonthName) ?? peakMonth;

  const overviewFlood = floodForRelease(colours, firstRelease);
  const lastFlood = floodForRelease(colours, lastRelease);
  const monthFlood = activeMonth ? solid(monthColour[activeMonth.month] ?? GROUND) : GROUND_FLOOD;
  const topArtistRelease = artistLead(artists[0]);
  const artistFlood = topArtistRelease ? floodForRelease(colours, topArtistRelease) : GROUND_FLOOD;

  const floods: Flood[] = [overviewFlood, overviewFlood, GROUND_FLOOD, monthFlood, artistFlood, GROUND_FLOOD, lastFlood];
  const leads: Array<WrappedRelease | undefined> = [
    firstRelease,
    lastRelease,
    activeMonth?.releases[0],
    activeMonth?.releases[0],
    topArtistRelease,
    genres[0]?.lead,
    lastRelease,
  ];

  const lead = leads[current];
  const leadCover = lead ? getAlbumImageFromData(releaseUri(lead.slug), 'medium') : null;
  const leadLabel = lead ? floodForRelease(colours, lead).ground : floods[current].ground;

  // Transport: a CSS progress animation per chapter; when it ends the next one plays.
  const [playing, setPlaying] = useState(false);
  const { nextSection } = navigation;
  const onTrackEnd = useCallback(() => {
    if (current >= CHAPTERS.length - 1) setPlaying(false);
    else nextSection();
  }, [current, nextSection]);

  return (
    <div id="wrapped-presentation" className="fixed inset-0 z-50 overflow-hidden bg-[var(--ground)] text-[color:var(--cream)]">
      {/* The site logo, as in the nav: a spinning record carrying the chapter's lead sleeve. */}
      <Link to="/" className="fixed left-3 top-3 z-[70] md:left-5 md:top-4" aria-label="russ.fm — home">
        <SpinningMark size={48} label={leadLabel} cover={leadCover} />
      </Link>

      <Transport
        current={current}
        playing={playing}
        onToggle={() => setPlaying(p => !p)}
        onSelect={navigation.goToSection}
        onPrev={navigation.prevSection}
        onNext={navigation.nextSection}
        onTrackEnd={onTrackEnd}
      />

      <PresentationContainer ref={navigation.containerRef} onScroll={navigation.handleScroll} className="relative z-10 h-[100dvh]">
        {CHAPTERS.map((chapter, i) => (
          <PresentationSection
            key={chapter.id}
            id={`wrapped-${chapter.id}`}
            aria-label={`${chapter.track} ${chapter.label}`}
            className="flood-surface h-[100dvh] min-h-[100dvh] items-stretch justify-stretch"
            style={{ background: floods[i].flood, color: floods[i].ink }}
          >
            <div
              className="relative h-full w-full"
              data-active={i === current}
              data-seen={seen.has(i)}
            >
              {chapter.id === 'overview' && (
                <Overview data={data} releases={releases} flood={overviewFlood} peakMonth={peakMonth} active={i === current} />
              )}
              {chapter.id === 'first-last' && (
                <FirstLast first={firstRelease} last={lastRelease} firstFlood={overviewFlood} lastFlood={lastFlood} active={i === current} />
              )}
              {chapter.id === 'months' && (
                <Months
                  timeline={data.insights.timeline}
                  activeMonth={activeMonth}
                  peakMonth={peakMonth}
                  onSelect={setActiveMonthName}
                  colours={colours}
                />
              )}
              {chapter.id === 'shelves' && (
                <Shelves
                  timeline={data.insights.timeline}
                  activeMonth={activeMonth}
                  onSelect={setActiveMonthName}
                  flood={monthFlood}
                  colours={colours}
                />
              )}
              {chapter.id === 'artists' && <Artists artists={artists} flood={artistFlood} lead={artistLead} colours={colours} />}
              {chapter.id === 'genres' && <Genres genres={genres} total={data.summary.totalReleases} />}
              {chapter.id === 'years' && (
                <Years
                  data={data}
                  last={lastRelease}
                  flood={lastFlood}
                  availableYears={availableYears}
                  previousYear={previousYear}
                  nextYear={nextYear}
                  active={i === current}
                />
              )}
            </div>
          </PresentationSection>
        ))}
      </PresentationContainer>
    </div>
  );
}

// ---------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------

/** Room left for the logo/year controls above and the transport below. */
function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative flex h-full w-full px-5 pb-28 pt-20 sm:px-8 md:pb-32 md:pt-24 lg:px-16', className)}>
      <div className="mx-auto flex h-full w-full min-w-0 max-w-[1640px]">{children}</div>
    </div>
  );
}

function Transport({
  current,
  playing,
  onToggle,
  onSelect,
  onPrev,
  onNext,
  onTrackEnd,
}: {
  current: number;
  playing: boolean;
  onToggle: () => void;
  onSelect: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onTrackEnd: () => void;
}) {
  const chapter = CHAPTERS[current];
  return (
    <nav
      aria-label="Chapters"
      className="fixed bottom-3 left-1/2 z-[66] flex w-[calc(100%-24px)] max-w-[820px] -translate-x-1/2 items-center gap-2 rounded-full bg-[rgba(14,13,12,.92)] p-1.5 text-[color:var(--cream)] shadow-[0_18px_40px_-18px_rgba(0,0,0,.7)] md:bottom-5 md:gap-3 md:p-2"
    >
      <div className="hidden w-[118px] min-w-0 shrink-0 flex-col pl-3 md:flex" aria-live="polite">
        <span className="t-mono text-[11px] font-bold text-[color:var(--cream-dim)]">{chapter.track}</span>
        <span className="truncate text-[14px] font-bold">{chapter.label}</span>
      </div>
      <button type="button" className="icon-btn hidden h-10 w-10 border-2 border-[color:var(--cream-rule)] sm:inline-flex" onClick={onPrev} aria-label="Previous chapter" disabled={current === 0}>
        <SkipBack className="h-4 w-4" fill="currentColor" />
      </button>
      <ol className="m-0 flex min-w-0 flex-1 list-none items-end gap-1.5 p-0 md:gap-2">
        {CHAPTERS.map((c, i) => {
          const on = i === current;
          return (
            <li key={c.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-label={`${c.track} ${c.label}`}
                aria-current={on ? 'step' : undefined}
                className={cn('flex h-11 w-full flex-col justify-end gap-1.5 text-left transition-colors', on ? 'text-[color:var(--cream)]' : 'text-[color:var(--cream-dim)] hover:text-[color:var(--cream)]')}
              >
                <span className="t-mono text-[11px] font-bold">{c.track}</span>
                <span className="relative block h-[3px] overflow-hidden rounded-full">
                  <span className="absolute inset-0 bg-current opacity-30" />
                  {i < current && <span className="absolute inset-0 bg-current opacity-70" />}
                  {on && !playing && <span className="absolute inset-0 bg-current" />}
                  {on && playing && (
                    <span
                      key={`${current}-play`}
                      className="hero-progress absolute inset-0 origin-left bg-current"
                      style={{ animationDuration: `${PLAY_MS}ms` }}
                      onAnimationEnd={onTrackEnd}
                    />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <button type="button" className="icon-btn hidden h-10 w-10 border-2 border-[color:var(--cream-rule)] sm:inline-flex" onClick={onNext} aria-label="Next chapter" disabled={current === CHAPTERS.length - 1}>
        <SkipForward className="h-4 w-4" fill="currentColor" />
      </button>
      <button
        type="button"
        className="icon-btn h-10 w-10 shrink-0 md:h-12 md:w-12"
        style={{ background: 'var(--cream)', color: 'var(--ground)' }}
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play through the chapters'}
        aria-pressed={playing}
      >
        {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />}
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------
// A1 · Overview
// ---------------------------------------------------------------------

function Overview({
  data,
  releases,
  flood,
  peakMonth,
  active,
}: {
  data: WrappedData;
  releases: WrappedRelease[];
  flood: Flood;
  peakMonth?: TimelineMonth;
  active: boolean;
}) {
  const conveyor = releases.slice(0, 36);
  const columns = [0, 1, 2].map(c => conveyor.filter((_, i) => i % 3 === c));
  return (
    <>
      {/* A single row of sleeves along the bottom on phones; columns beside the text from lg. */}
      <div className="wr-edge-fade-x pointer-events-none absolute inset-x-0 bottom-24 overflow-hidden md:bottom-28 lg:hidden" aria-hidden>
        <div className="wr-conveyor-x flex w-max gap-3" style={{ '--dur': '60s' } as CSSProperties}>
          {[...conveyor.slice(0, 16), ...conveyor.slice(0, 16)].map((r, i) => (
            <div key={`${r.slug}-${i}`} className="w-[92px] shrink-0 md:w-[128px]">
              <ConveyorSleeve release={r} />
            </div>
          ))}
        </div>
      </div>

      <Frame>
        <div className="flex w-full min-w-0 shrink-0 flex-col justify-start pb-[120px] [container-type:inline-size] md:pb-[160px] lg:w-[56%] lg:justify-center lg:pb-0">
          <div className="wr-rise t-kicker" style={{ color: flood.sub }}>
            Wrapped{data.isYearToDate ? ' · Year to date' : ''}
          </div>
          <h1 className="wr-rise t-disp m-0 mt-2 text-[min(24vw,30dvh)] leading-[.86] lg:text-[min(29cqw,34dvh)]" style={{ '--d': '80ms' } as CSSProperties}>
            {data.year}
          </h1>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 md:mt-10 md:grid-cols-4 md:gap-x-8">
            <Stat label="Records" to={data.summary.totalReleases} run={active} sub={flood.sub} delay={200} />
            <Stat label="Artists" to={data.summary.uniqueArtists} run={active} sub={flood.sub} delay={280} />
            <Stat label="A month" to={data.summary.avgPerMonth} decimals={1} run={active} sub={flood.sub} delay={360} />
            <Stat label="Busiest month" text={(peakMonth?.month || data.summary.peakMonth || '—').slice(0, 3)} sub={flood.sub} delay={440} />
          </dl>
        </div>
        {/* Sleeves riding up and down beside the text, bleeding to the top and bottom edges. */}
        <div className="relative hidden min-w-0 flex-1 overflow-hidden lg:-mb-32 lg:-mt-24 lg:ml-12 lg:block xl:ml-16">
          <div className="wr-edge-fade-y pointer-events-none absolute inset-x-0 inset-y-0 flex gap-4" aria-hidden>
            {columns.map((col, c) => (
              <div key={c} className="min-w-0 flex-1">
                <div className={cn('wr-conveyor-y flex flex-col gap-4', c === 1 && 'wr-reverse')} style={{ '--dur': `${70 + c * 12}s` } as CSSProperties}>
                  {[...col, ...col].map((r, i) => (
                    <ConveyorSleeve key={`${r.slug}-${i}`} release={r} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Frame>
    </>
  );
}

function ConveyorSleeve({ release }: { release: WrappedRelease }) {
  return (
    <div className="sleeve aspect-square w-full">
      <img src={getAlbumImageFromData(releaseUri(release.slug), 'medium')} alt="" loading="lazy" decoding="async" onError={handleImageError} />
    </div>
  );
}

/** Counts up from zero the first time `run` is true. */
function useCountUp(to: number, run: boolean, decimals = 0) {
  const [value, setValue] = useState(() => (reducedMotion() ? to : 0));
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!run || done) return;
    if (reducedMotion()) {
      setValue(to);
      setDone(true);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(to * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else setDone(true);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, run, done]);
  return decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString('en-GB');
}

function Stat({
  label,
  to,
  text,
  decimals = 0,
  run = false,
  sub,
  delay,
}: {
  label: string;
  to?: number;
  text?: string;
  decimals?: number;
  run?: boolean;
  sub: string;
  delay: number;
}) {
  const counted = useCountUp(to ?? 0, run, decimals);
  return (
    <div className="wr-rise flex min-w-0 flex-col-reverse gap-1.5" style={{ '--d': `${delay}ms` } as CSSProperties}>
      <dt className="t-mono text-[11px] font-bold uppercase" style={{ color: sub }}>
        {label}
      </dt>
      <dd className="t-cond m-0 text-[clamp(44px,5.4vw,104px)] leading-[.9] tabular-nums">{text ?? counted}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------
// A2 · First & last
// ---------------------------------------------------------------------

function FirstLast({
  first,
  last,
  firstFlood,
  lastFlood,
  active,
}: {
  first?: WrappedRelease;
  last?: WrappedRelease;
  firstFlood: Flood;
  lastFlood: Flood;
  active: boolean;
}) {
  if (!first || !last) return <EmptyChapter title="First & last" detail="Not enough records this year." />;
  const days = Math.max(0, Math.round((new Date(last.date_added).getTime() - new Date(first.date_added).getTime()) / DAY_MS));
  return (
    <>
      {/* The last record's flood takes the right half (bottom half on phones). */}
      <div className="flood-surface absolute inset-x-0 bottom-0 top-1/2 md:inset-y-0 md:left-1/2 md:top-0" style={{ background: lastFlood.flood }} aria-hidden />
      <div className="relative grid h-full grid-rows-2 md:grid-cols-2 md:grid-rows-1">
        <Bookend release={first} flood={firstFlood} label="First" active={active} side="first" />
        <Bookend release={last} flood={lastFlood} label="Last" active={active} side="last" />
      </div>
      <div
        className="wr-pop absolute left-1/2 top-1/2 z-10 flex h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full text-center shadow-[0_18px_40px_-14px_rgba(0,0,0,.7)] md:h-[148px] md:w-[148px]"
        style={{ background: GROUND, color: CREAM, '--d': '500ms' } as CSSProperties}
      >
        <span className="t-cond text-[40px] leading-none md:text-[60px]">{days}</span>
        <span className="t-mono mt-1 text-[10px] font-bold uppercase tracking-[0.12em] md:text-[11px]">days apart</span>
      </div>
    </>
  );
}

function Bookend({
  release,
  flood,
  label,
  active,
  side,
}: {
  release: WrappedRelease;
  flood: Flood;
  label: string;
  active: boolean;
  side: 'first' | 'last';
}) {
  const uri = releaseUri(release.slug);
  const artist = release.artists[0];
  const d = side === 'first' ? 0 : 160;
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 items-center gap-4 px-5 sm:px-8 md:flex-col md:items-start md:justify-center md:gap-8 md:pb-32 md:pt-24 lg:px-16',
        side === 'first' ? 'pb-16 pt-20' : 'pb-28 pt-16',
        side === 'last' && 'md:pl-24 lg:pl-28',
        side === 'first' && 'md:pr-24 lg:pr-28',
      )}
      style={{ color: flood.ink }}
    >
      <Link
        to={uri}
        className="wr-rise block w-[38%] max-w-[180px] shrink-0 md:w-[min(26vw,36dvh)] md:max-w-none"
        style={{ '--d': `${d}ms` } as CSSProperties}
        aria-label={`${release.release_name} by ${release.release_artist}`}
      >
        <HeroRecord
          src={getAlbumImageFromData(uri, 'hi-res')}
          alt=""
          labelColour={flood.ground}
          discOut={active ? 18 : 0}
          spinning={active}
          eager={false}
          sticker={{ date: release.date_added, background: flood.ink, color: flood.flood, label }}
          stickerOnMobile={false}
        />
      </Link>
      <div className="wr-rise min-w-0 md:w-full" style={{ '--d': `${d + 120}ms` } as CSSProperties}>
        <div className="t-mono text-[11px] font-bold uppercase md:text-[12px]" style={{ color: flood.sub }}>
          {label} · {formatDay(release.date_added)}
        </div>
        <Link to={uri} className="mt-2 block hover:underline">
          <FitTitle as="h2" max={68} min={22} className="t-cond line-clamp-3 leading-[.92]">
            {release.release_name}
          </FitTitle>
        </Link>
        {artist ? (
          <Link to={artistUri(artist.slug)} className="t-dispn mt-2 inline-block text-[16px] hover:underline md:text-[24px]">
            {release.release_artist}
          </Link>
        ) : (
          <div className="t-dispn mt-2 text-[16px] md:text-[24px]">{release.release_artist}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// A3 · Months: every record added that month as a spine on a stack
// ---------------------------------------------------------------------

function Months({
  timeline,
  activeMonth,
  peakMonth,
  onSelect,
  colours,
}: {
  timeline: TimelineMonth[];
  activeMonth?: TimelineMonth;
  peakMonth?: TimelineMonth;
  onSelect: (month: string) => void;
  colours: ColourMap;
}) {
  const max = Math.max(1, ...timeline.map(m => m.count));
  const fan = activeMonth?.releases.slice(0, 5) ?? [];
  const isPeak = activeMonth?.month === peakMonth?.month;
  return (
    <Frame>
      <div className="flex w-full min-w-0 flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-14">
        <div className="flex min-w-0 shrink-0 flex-col justify-center lg:w-[30%]">
          <div className="wr-rise t-kicker text-[color:var(--cream-dim)]">{isPeak ? 'Busiest month' : 'Month'}</div>
          <div key={activeMonth?.month} className="wr-swap t-cond mt-2 text-[clamp(64px,9vw,168px)] leading-[.86]">
            {activeMonth?.month ?? '—'}
          </div>
          <div className="t-mono mt-2 text-[13px] text-[color:var(--cream-dim)]">
            {activeMonth ? `${activeMonth.count} ${activeMonth.count === 1 ? 'record' : 'records'}` : ''}
          </div>
          {fan.length > 0 && (
            <div key={`fan-${activeMonth?.month}`} className="relative mt-8 hidden h-[clamp(140px,22dvh,220px)] lg:block" aria-hidden>
              {fan.map((r, i) => (
                <Sleeve
                  key={r.slug}
                  src={getAlbumImageFromData(releaseUri(r.slug), 'medium')}
                  alt=""
                  className="wr-fan absolute top-0 aspect-square h-full"
                  style={{ left: `${i * 16}%`, zIndex: fan.length - i, '--r': `${(i - 2) * 5}deg`, '--d': `${i * 60}ms` } as CSSProperties}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-[40dvh] flex-1 items-stretch gap-1 sm:gap-2 lg:gap-3" role="group" aria-label="Records added each month">
            {timeline.map((month, c) => {
              const on = month.month === activeMonth?.month;
              return (
                <button
                  key={month.month}
                  type="button"
                  onClick={() => onSelect(month.month)}
                  disabled={month.count === 0}
                  aria-pressed={on}
                  aria-label={`${month.month}, ${month.count} ${month.count === 1 ? 'record' : 'records'}`}
                  className={cn('group flex min-w-0 flex-1 flex-col items-stretch justify-end gap-2 disabled:cursor-default', on ? 'opacity-100' : 'opacity-60 hover:opacity-100')}
                >
                  <span className="t-mono text-center text-[10px] tabular-nums md:text-[12px]">{month.count || ''}</span>
                  <span className="flex flex-col-reverse gap-[2px]" style={{ height: `${(month.count / max) * 100}%` }}>
                    {month.releases.map((r, j) => (
                      <span
                        key={`${r.slug}-${j}`}
                        className="wr-spine block min-h-0 flex-1 rounded-[2px]"
                        style={{ background: floodForRelease(colours, r).flood, '--d': `${c * 45 + j * 16}ms` } as CSSProperties}
                        title={`${r.release_name} — ${r.release_artist}`}
                      />
                    ))}
                  </span>
                  <span className={cn('t-mono border-t-[3px] pt-1.5 text-center text-[10px] font-bold uppercase md:text-[12px]', on ? 'border-current' : 'border-transparent')}>
                    <span className="md:hidden">{month.month.slice(0, 1)}</span>
                    <span className="hidden md:inline">{month.month.slice(0, 3)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------
// A4 · Shelves: the selected month's records
// ---------------------------------------------------------------------

function Shelves({
  timeline,
  activeMonth,
  onSelect,
  flood,
  colours,
}: {
  timeline: TimelineMonth[];
  activeMonth?: TimelineMonth;
  onSelect: (month: string) => void;
  flood: Flood;
  colours: ColourMap;
}) {
  const current = activeMonth && activeMonth.releases.length > 0 ? activeMonth : timeline.find(m => m.releases.length > 0);
  if (!current) return <EmptyChapter title="Shelves" detail="No records this year." />;
  // RecordTile paints its text in cream-dim; on a flood we override with the flood's ink.
  const tileStyle = { color: flood.ink, '--cream-dim': flood.sub } as CSSProperties;

  return (
    <Frame>
      <div className="flex w-full min-w-0 flex-col justify-center gap-6 md:gap-8">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h2 key={current.month} className="wr-swap t-disp m-0 text-[clamp(48px,7vw,120px)] leading-[.9]">
              {current.month}
            </h2>
            <div className="t-mono mt-2 text-[12px] uppercase" style={{ color: flood.sub }}>
              {current.releases.length} {current.releases.length === 1 ? 'record' : 'records'}
            </div>
          </div>
          <div className="grid w-full grid-cols-12 gap-1 sm:w-auto sm:gap-2" role="group" aria-label="Choose a month">
            {timeline.map(month => {
              const on = month.month === current.month;
              return (
                <button
                  key={month.month}
                  type="button"
                  onClick={() => onSelect(month.month)}
                  disabled={month.releases.length === 0}
                  aria-pressed={on}
                  aria-label={month.month}
                  className={cn('flex h-11 min-w-0 flex-col justify-end gap-1.5 disabled:opacity-30 sm:w-9', on ? 'opacity-100' : 'opacity-60 hover:opacity-100')}
                >
                  <span className="t-mono text-[10px] font-bold uppercase sm:text-[11px]">
                    <span className="sm:hidden">{month.month.slice(0, 1)}</span>
                    <span className="hidden sm:inline">{month.month.slice(0, 3)}</span>
                  </span>
                  <span className={cn('block h-[3px] rounded-full bg-current', on ? 'opacity-100' : 'opacity-30')} />
                </button>
              );
            })}
          </div>
        </div>

        <div key={current.month} className="shelf-scroll -mx-5 gap-4 px-5 pb-2 pt-2 sm:-mx-8 sm:px-8 md:gap-6 lg:-mx-16 lg:px-16" aria-label={`${current.month} records`}>
          {current.releases.map((release, index) => (
            <div
              key={`${release.slug}-${index}`}
              className="wr-shelf w-[42vw] max-w-[190px] shrink-0 md:w-[min(20vw,40dvh)] md:max-w-[300px]"
              style={{ ...tileStyle, '--d': `${Math.min(index, 8) * 50}ms` } as CSSProperties}
            >
              <RecordTile album={tileAlbum(release)} palette={paletteForRelease(colours, release)} meta={formatDay(release.date_added, false)} />
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------
// B1 · Artists
// ---------------------------------------------------------------------

function Artists({
  artists,
  flood,
  lead,
  colours,
}: {
  artists: TopArtist[];
  flood: Flood;
  lead: (artist?: TopArtist) => WrappedRelease | undefined;
  colours: ColourMap;
}) {
  const [top, ...rest] = artists;
  if (!top) return <EmptyChapter title="Artists" detail="No artists this year." />;
  const max = Math.max(1, ...artists.map(a => a.count));
  // Blend the portrait into the flood: screen lifts a dark photo into a dark flood, multiply stains a pale one.
  const blend = flood.ink !== INK ? 'screen' : 'multiply';
  const portrait = getArtistImageFromData(artistUri(top.slug), 'hi-res');

  return (
    <Frame>
      <div className="grid w-full min-w-0 grid-cols-1 content-center gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center md:gap-12 lg:gap-16">
        <div className="wr-rise flex min-w-0 items-end gap-4 md:block">
          <div className="aspect-[4/5] w-[34%] max-w-[160px] shrink-0 overflow-hidden md:mx-auto md:h-[min(62dvh,640px)] md:w-auto md:max-w-none">
            <img
              src={portrait}
              alt=""
              className="h-full w-full object-cover object-top grayscale contrast-[1.2]"
              style={{ mixBlendMode: blend, maskImage: 'linear-gradient(to bottom, #000 70%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 70%, transparent)' }}
              onError={handleImageError}
            />
          </div>
          <div className="min-w-0 flex-1 pb-2 md:hidden">
            <TopArtistName artist={top} sub={flood.sub} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6 md:gap-8">
          <div className="wr-rise hidden md:block" style={{ '--d': '120ms' } as CSSProperties}>
            <TopArtistName artist={top} sub={flood.sub} />
          </div>
          {rest.length > 0 && (
            <ol className="m-0 flex list-none flex-col p-0">
              {rest.map((a, i) => {
                const release = lead(a);
                const bar = release ? floodForRelease(colours, release).flood : flood.ink;
                return (
                  <li key={a.slug} className="wr-rise border-t" style={{ borderColor: `color-mix(in srgb, ${flood.ink} 20%, transparent)`, '--d': `${240 + i * 80}ms` } as CSSProperties}>
                    <Link to={artistUri(a.slug)} className="group flex min-h-[52px] items-center gap-3 py-2 md:gap-4">
                      <span className="t-mono w-7 shrink-0 text-[12px] font-bold" style={{ color: flood.sub }}>
                        {String(i + 2).padStart(2, '0')}
                      </span>
                      <img
                        src={getArtistAvatarFromData(artistUri(a.slug))}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 shrink-0 rounded-full object-cover md:h-11 md:w-11"
                        style={{ boxShadow: `0 0 0 3px ${bar}` }}
                        onError={handleImageError}
                      />
                      <span className="t-dispn min-w-0 flex-1 truncate text-[16px] group-hover:underline md:text-[22px]">{a.name}</span>
                      <span className="hidden h-2 w-[18%] overflow-hidden rounded-full sm:block" style={{ background: `color-mix(in srgb, ${flood.ink} 16%, transparent)` }}>
                        <span className="block h-full rounded-full" style={{ width: `${(a.count / max) * 100}%`, background: flood.ink }} />
                      </span>
                      <span className="t-mono w-6 shrink-0 text-right text-[13px] font-bold tabular-nums">{a.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Frame>
  );
}

function TopArtistName({ artist, sub }: { artist: TopArtist; sub: string }) {
  return (
    <>
      <div className="t-mono text-[11px] font-bold uppercase md:text-[12px]" style={{ color: sub }}>
        No. 1 · {artist.count} {artist.count === 1 ? 'record' : 'records'}
      </div>
      <Link to={artistUri(artist.slug)} className="mt-1 block hover:underline">
        <FitTitle as="h2" max={150} min={28} className="t-disp leading-[.9]">
          {artist.name}
        </FitTitle>
      </Link>
    </>
  );
}

// ---------------------------------------------------------------------
// B2 · Genres: full-width bands, each as tall as its share
// ---------------------------------------------------------------------

function Genres({
  genres,
  total,
}: {
  genres: Array<{ name: string; count: number; percentage: number; colour: string }>;
  total: number;
}) {
  if (genres.length === 0) return <EmptyChapter title="Genres" detail="No genres this year." />;
  return (
    <div className="flex h-full w-full flex-col pb-24 pt-20 md:pb-28 md:pt-24">
      <div className="mx-auto flex w-full max-w-[1640px] items-end justify-between gap-6 px-5 pb-5 sm:px-8 lg:px-16">
        <h2 className="wr-rise t-disp m-0 text-[clamp(36px,5vw,80px)] leading-[.9]">Genres</h2>
        <div className="wr-rise t-mono text-right text-[11px] uppercase text-[color:var(--cream-dim)] md:text-[12px]">
          Share of {total.toLocaleString('en-GB')} records
        </div>
      </div>
      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-[3px] p-0">
        {genres.map((g, i) => {
          const ink = inkOn(g.colour);
          return (
            <li key={g.name} className="flex min-h-[44px]" style={{ flex: `${g.count} 1 0` }}>
              <Link
                to={`/genre/${slugify(g.name)}`}
                className="wr-band group relative flex w-full items-center overflow-hidden"
                style={{ background: g.colour, color: ink, containerType: 'size', '--d': `${i * 110}ms` } as CSSProperties}
              >
                <span className="mx-auto flex w-full max-w-[1640px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-16">
                  <span className="t-disp min-w-0 truncate text-[clamp(15px,min(64cqh,6.5vw),104px)] leading-none group-hover:underline">{g.name}</span>
                  <span className="flex shrink-0 items-baseline gap-3">
                    <span className="t-cond text-[clamp(18px,min(58cqh,5vw),88px)] leading-none tabular-nums">{g.percentage.toFixed(0)}%</span>
                    <span className="t-mono hidden text-[12px] tabular-nums sm:inline" style={{ color: subInk(ink) }}>
                      {g.count}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// B3 · Years: the run-out groove
// ---------------------------------------------------------------------

function Years({
  data,
  last,
  flood,
  availableYears,
  previousYear,
  nextYear,
  active,
}: {
  data: WrappedData;
  last?: WrappedRelease;
  flood: Flood;
  availableYears: number[];
  previousYear?: number;
  nextYear?: number;
  active: boolean;
}) {
  const cover = last ? getAlbumImageFromData(releaseUri(last.slug), 'hi-res') : null;
  return (
    <Frame>
      <div className="grid w-full min-w-0 grid-cols-1 content-center items-center gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-14">
        <div className="wr-rise relative mx-auto aspect-square w-[min(58vw,32dvh)] md:w-[min(100%,62dvh)]">
          <Vinyl label={flood.ground} cover={cover} spin={active} className="inset-0 h-full w-full" />
        </div>
        <div className="min-w-0 [container-type:inline-size]">
          <div className="wr-rise t-kicker" style={{ color: flood.sub, '--d': '100ms' } as CSSProperties}>
            {data.isYearToDate ? 'Year to date' : 'Wrapped'}
          </div>
          <div className="wr-rise t-disp mt-2 text-[clamp(64px,min(29cqw,24dvh),220px)] leading-[.86]" style={{ '--d': '160ms' } as CSSProperties}>
            {data.year}
          </div>
          <div className="wr-rise t-mono mt-3 text-[12px] uppercase md:text-[13px]" style={{ color: flood.sub, '--d': '220ms' } as CSSProperties}>
            {data.summary.totalReleases.toLocaleString('en-GB')} records · {data.summary.uniqueArtists.toLocaleString('en-GB')} artists
          </div>
          <div className="wr-rise mt-6 flex flex-wrap gap-3 md:mt-8" style={{ '--d': '280ms' } as CSSProperties}>
            {previousYear && (
              <Link to={`/wrapped/${previousYear}`} className="pill" aria-label={`Previous year, ${previousYear}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                <span className="t-mono">{previousYear}</span>
              </Link>
            )}
            {nextYear && (
              <Link to={`/wrapped/${nextYear}`} className="pill pill-solid" style={{ background: flood.ink, color: flood.flood }} aria-label={`Next year, ${nextYear}`}>
                <span className="t-mono">{nextYear}</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
          <nav aria-label="All Wrapped years" className="wr-rise mt-6 md:mt-10" style={{ '--d': '340ms' } as CSSProperties}>
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
              {availableYears.map(year => {
                const on = year === data.year;
                return (
                  <li key={year}>
                    <Link
                      to={`/wrapped/${year}`}
                      aria-current={on ? 'page' : undefined}
                      className={cn('t-mono inline-flex min-h-[36px] items-center border-b-[3px] text-[13px] font-bold', on ? 'border-current' : 'border-transparent opacity-60 hover:opacity-100')}
                    >
                      {year}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------

function EmptyChapter({ title, detail }: { title: string; detail: string }) {
  return (
    <Frame>
      <div className="m-auto max-w-xl text-center">
        <h2 className="t-disp m-0 text-[clamp(34px,7vw,72px)]">{title}</h2>
        <p className="t-mono mt-5 text-[13px] opacity-70">{detail}</p>
      </div>
    </Frame>
  );
}
