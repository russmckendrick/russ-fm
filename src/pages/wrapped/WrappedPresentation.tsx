import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LayoutList, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useWrappedNavigation } from './hooks/useWrappedNavigation';
import { FitTitle, HeroRecord, SpinningMark, Vinyl } from '@/components/player';
import { useVinylColours } from '@/hooks/useVinylColours';
import { getAlbumImageUrl, handleImageError } from '@/lib/image-utils';
import { discLook, discLooks } from '@/lib/vinylLook';
import { cn } from '@/lib/utils';
import type { WrappedData } from '@/types/wrapped';
import { buildStory, longDate, MONTHS, MONTHS_LONG, shortDate, type Artist, type Release, type Story } from './story/core';
import { artistUri, releaseUri } from './utils/sleeves';
import './presentation.css';

interface WrappedPresentationProps {
  data: WrappedData;
  availableYears: number[];
  previousYear?: number;
  nextYear?: number;
  /** Back to the year page */
  onClose: () => void;
}

const SLIDES = [
  { id: 'title', label: 'The year' },
  { id: 'first-last', label: 'First & last' },
  { id: 'months', label: 'Month by month' },
  { id: 'artists', label: 'Artists' },
  { id: 'genres', label: 'Genres' },
  { id: 'colour', label: 'In colour' },
  { id: 'numbers', label: 'By the numbers' },
  { id: 'finale', label: 'Run-out' },
] as const;

/** How long each slide plays for when the transport is playing. */
const PLAY_MS = 8000;
const AMBER = '#e9a23b';
const DAY_MS = 86_400_000;

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const flood = (r?: Release | null) => r?.c.flood || AMBER;
const vars = (v: Record<string, string | number>) => v as CSSProperties;
const records = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'record' : 'records'}`;
const hiRes = (r: Release) => getAlbumImageUrl(r.s, 'hi-res');

/** `n` items spread evenly through a list. */
function sample<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]);
}

/** The most vivid sleeve in a group, to stand for it. */
const vivid = (list: Release[]) => list.reduce<Release | undefined>((a, r) => (r.c.flood && (r.c.vivid ?? 0) > (a?.c.vivid ?? -1) ? r : a), undefined);

/**
 * The year as eight full-screen slides, drawn from the same `story` block as the
 * year page: title, first and last record, the months, artists, genres, the year
 * in colour, the numbers and a run-out. Each slide sits on a sleeve blurred into
 * light; a glass transport steps or plays through them.
 */
export function WrappedPresentation({ data, availableYears, previousYear, nextYear, onClose }: WrappedPresentationProps) {
  const story = useMemo(() => buildStory(data), [data]);
  const vinylOf = useVinylColours();
  const navigation = useWrappedNavigation({ totalSections: SLIDES.length });
  const { currentSection: current, nextSection, prevSection } = navigation;

  // Slides play their entrance the first time they come round.
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  useEffect(() => {
    setSeen(prev => (prev.has(current) ? prev : new Set(prev).add(current)));
  }, [current]);

  // Transport: a timer per slide while playing; the segment's fill is only the picture of it.
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      if (current >= SLIDES.length - 1) setPlaying(false);
      else nextSection();
    }, PLAY_MS);
    return () => clearTimeout(t);
  }, [playing, current, nextSection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextSection();
      else if (e.key === 'ArrowLeft') prevSection();
      else if (e.key === 'Escape') onClose();
      else if (e.key.toLowerCase() === 'p') setPlaying(p => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nextSection, prevSection, onClose]);

  const view = useMemo(() => (story ? derive(story) : null), [story]);
  const [month, setMonth] = useState<number | null>(null);

  if (!story || !view) {
    return (
      <div className="wp fixed inset-0 z-50 flex items-center justify-center">
        <p className="wp-lede">There are no records for {data.year} yet.</p>
      </div>
    );
  }

  const activeMonth = month !== null && view.months[month].list.length ? month : view.peak;
  const leads: Array<Release | undefined> = [
    view.first,
    view.last,
    view.months[activeMonth].lead,
    view.topRecords[0],
    view.fams[0]?.lead,
    view.spectrum[0],
    view.cover,
    view.last,
  ];
  const lead = leads[current] ?? view.first;
  const slide = (i: number) => ({ 'data-active': i === current, 'data-seen': seen.has(i) });

  return (
    <div id="wrapped-presentation" className="wp fixed inset-0 z-50 overflow-hidden">
      <div className="wp-grain" aria-hidden />

      {/* The site logo, as in the nav: a spinning record carrying the slide's lead sleeve. */}
      <Link to="/" className="fixed left-3 top-3 z-[70] md:left-5 md:top-4" aria-label="russ.fm — home">
        <SpinningMark size={48} label={lead.c.ground || '#0e0d0c'} cover={lead.img} look={discLook(vinylOf(releaseUri(lead.s)), 0)} />
      </Link>

      <Transport
        current={current}
        playing={playing}
        onToggle={() => setPlaying(p => !p)}
        onSelect={navigation.goToSection}
        onPrev={prevSection}
        onNext={nextSection}
      />

      <div
        ref={navigation.containerRef}
        onScroll={navigation.handleScroll}
        className="relative z-10 h-[100dvh] snap-y snap-mandatory overflow-y-auto overflow-x-hidden scroll-smooth motion-reduce:scroll-auto"
      >
        <Slide index={0} flood={flood(view.cover)} {...slide(0)}>
          <Title story={story} view={view} active={current === 0} onPlay={() => { setPlaying(true); nextSection(); }} />
        </Slide>
        <Slide index={1} flood={flood(view.first)} {...slide(1)}>
          <FirstLast view={view} active={current === 1} seen={seen.has(1)} />
        </Slide>
        <Slide index={2} flood={view.months[activeMonth].colour} backdrop={view.months[activeMonth].lead} {...slide(2)}>
          <Months story={story} view={view} active={activeMonth} onSelect={setMonth} />
        </Slide>
        <Slide index={3} flood={flood(view.topRecords.find(r => r.c.flood))} {...slide(3)}>
          <Artists story={story} view={view} />
        </Slide>
        <Slide index={4} flood={view.fams[0]?.colour ?? AMBER} backdrop={view.fams[0]?.lead} {...slide(4)}>
          <Genres story={story} view={view} />
        </Slide>
        <Slide index={5} flood={flood(view.spectrum[Math.floor(view.spectrum.length / 3)])} {...slide(5)}>
          <Colour story={story} view={view} />
        </Slide>
        <Slide index={6} flood={flood(view.cover)} backdrop={view.cover} {...slide(6)}>
          <Numbers story={story} view={view} active={current === 6} />
        </Slide>
        <Slide index={7} flood={flood(view.last)} {...slide(7)}>
          <Finale
            story={story}
            view={view}
            active={current === 7}
            availableYears={availableYears}
            previousYear={previousYear}
            nextYear={nextYear}
            onClose={onClose}
          />
        </Slide>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// What the slides show, worked out once per year
// ---------------------------------------------------------------------

function derive(story: Story) {
  const R = story.releases;
  const first = R[0], last = R[R.length - 1];

  const months = MONTHS_LONG.map((name, i) => {
    const list = R.filter(r => +r.d.slice(5, 7) - 1 === i);
    const lead = vivid(list) ?? list[0];
    return { i, name, list, lead, colour: flood(lead) };
  });
  const peak = months.reduce((a, m) => (m.list.length > months[a].list.length ? m.i : a), 0);

  const artists = story.artists.filter(a => a.s !== 'various' && a.s !== 'various-artists').sort((a, b) => b.n - a.n);
  const top: Artist | undefined = artists[0];
  const topRecords = top ? R.filter(r => r.a.includes(top.s)) : [];

  const famCount = new Map<string, Release[]>();
  for (const r of R) famCount.set(r.fam, [...(famCount.get(r.fam) ?? []), r]);
  const fams = story.families
    .map(f => ({ ...f, list: famCount.get(f.key) ?? [], colour: story.famColour[f.key] ?? AMBER }))
    .filter(f => f.list.length)
    .sort((a, b) => b.list.length - a.list.length)
    .map(f => ({ ...f, lead: vivid(f.list) ?? f.list[0], share: (f.list.length / R.length) * 100 }));

  // Every sleeve with a colour of its own, in hue order. The black, white and grey ones are left out:
  // they share one pale flood and drew as a flat grey block.
  const spectrum = R.filter(r => r.c.flood && r.c.vivid).sort((a, b) => (a.c.hue ?? 0) - (b.c.hue ?? 0));
  const coloured = R.filter(r => r.vc.length);

  const grams = R.reduce((a, r) => a + r.g_wt, 0);
  const discs = R.reduce((a, r) => a + r.discs, 0);
  const timed = R.filter(r => r.rt);
  const seconds = timed.reduce((a, r) => a + (r.rt ?? 0), 0);
  const dated = R.filter(r => r.y && r.y > 1900);
  const oldest = dated.reduce<Release | undefined>((a, r) => (!a || r.y! < a.y! ? r : a), undefined);
  const longest = timed.reduce<Release | undefined>((a, r) => (!a || r.rt! > a.rt! ? r : a), undefined);

  return {
    first, last, months, peak, artists, top, topRecords, fams, spectrum, coloured, plain: R.length - spectrum.length,
    grams, discs, seconds, oldest, longest,
    cover: vivid(R) ?? first,
    fresh: story.artists.filter(a => a.new).length,
    bigDay: story.byDay.get(story.biggest) ?? [],
    days: Math.max(0, Math.round((new Date(last.d).getTime() - new Date(first.d).getTime()) / DAY_MS)),
  };
}

type View = ReturnType<typeof derive>;

// ---------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------

function Slide({
  index,
  flood: colour,
  backdrop,
  children,
  ...state
}: {
  index: number;
  flood: string;
  /** Sleeve blurred into the background */
  backdrop?: Release;
  children: ReactNode;
  'data-active': boolean;
  'data-seen': boolean;
}) {
  return (
    <section id={`wrapped-${SLIDES[index].id}`} aria-label={SLIDES[index].label} className="wp-slide" style={vars({ '--flood': colour })} {...state}>
      <div className="wp-bg" aria-hidden>
        {backdrop && <img key={backdrop.s} src={backdrop.img} alt="" loading="lazy" decoding="async" onError={handleImageError} />}
      </div>
      {children}
    </section>
  );
}

function Transport({
  current,
  playing,
  onToggle,
  onSelect,
  onPrev,
  onNext,
}: {
  current: number;
  playing: boolean;
  onToggle: () => void;
  onSelect: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <nav aria-label="Slides" className="wp-transport">
      <div className="wp-transport-label" aria-live="polite">
        <b>{SLIDES[current].label}</b>
        <span>{current + 1} of {SLIDES.length}</span>
      </div>
      <button type="button" className="wp-tbtn step" onClick={onPrev} aria-label="Previous slide" disabled={current === 0}>
        <SkipBack className="h-4 w-4" fill="currentColor" />
      </button>
      <ol className="wp-segs">
        {SLIDES.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={cn('wp-seg', i < current && 'past')}
              onClick={() => onSelect(i)}
              aria-label={s.label}
              aria-current={i === current ? 'step' : undefined}
              title={s.label}
            >
              <i>
                {i < current && <span />}
                {i === current && <span key={`${i}-${playing}`} className={playing ? 'playing' : undefined} style={{ animationDuration: `${PLAY_MS}ms` }} />}
              </i>
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="wp-tbtn step" onClick={onNext} aria-label="Next slide" disabled={current === SLIDES.length - 1}>
        <SkipForward className="h-4 w-4" fill="currentColor" />
      </button>
      <button type="button" className="wp-tbtn play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play through the slides'} aria-pressed={playing}>
        {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />}
      </button>
    </nav>
  );
}

function Thumb({ r, className, style }: { r: Release; className?: string; style?: CSSProperties }) {
  return (
    <Link to={releaseUri(r.s)} className={cn('wp-thumb', className)} style={style} title={`${r.t} — ${r.by}`} aria-label={`${r.t} by ${r.by}`}>
      <img src={r.img} alt="" loading="lazy" decoding="async" onError={handleImageError} />
    </Link>
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
      const t = Math.min(1, (now - start) / 1600);
      setValue(to * (1 - Math.pow(1 - t, 4)));
      if (t < 1) raf = requestAnimationFrame(step);
      else setDone(true);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, run, done]);
  return value.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function Count({ to, run, decimals = 0 }: { to: number; run: boolean; decimals?: number }) {
  return <>{useCountUp(to, run, decimals)}</>;
}

// ---------------------------------------------------------------------
// 1 · Title: the year over a drifting wall of its sleeves
// ---------------------------------------------------------------------

function Title({ story, view, active, onPlay }: { story: Story; view: View; active: boolean; onPlay: () => void }) {
  const rows = useMemo(() => {
    const pool = sample(story.releases, 42);
    return [0, 1, 2, 3, 4, 5, 6].map(i => {
      const row = pool.filter((_, k) => k % 7 === i);
      // Short years repeat their sleeves so a row still spans the screen.
      return Array.from({ length: Math.max(8, row.length) }, (_, k) => row[k % row.length] ?? pool[k % pool.length]);
    });
  }, [story.releases]);
  const peak = view.months[view.peak];

  return (
    <>
      <div className="wp-wall" aria-hidden>
        {rows.map((row, i) => (
          <div key={i} className={cn('wp-wall-row', i % 2 === 1 && 'rev')} style={vars({ '--dur': `${96 + i * 14}s` })}>
            {[...row, ...row, ...row].map((r, k) => (
              <img key={k} src={r.img} alt="" loading={i > 1 && i < 5 ? 'eager' : 'lazy'} decoding="async" onError={handleImageError} />
            ))}
          </div>
        ))}
      </div>
      <div className="wp-title-shade" aria-hidden />

      <div className="wp-frame">
        <div className="wp-title">
          <div className="wp-up wp-kicker centre">Wrapped{story.ytd ? ' · the year so far' : ' · a year in records'}</div>
          {/* The numerals are a window onto a second, brighter wall of sleeves, with a hairline round them. */}
          <h1 className="wp-year" aria-label={String(story.year)}>
            <span className="wp-year-fill" aria-hidden>
              <span className="wp-year-wall">
                {rows.slice(2, 5).map((row, i) => (
                  <span key={i} className={cn('wp-wall-row', i % 2 === 0 && 'rev')} style={vars({ '--dur': `${70 + i * 12}s` })}>
                    {[...row, ...row, ...row].map((r, k) => (
                      <img key={k} src={r.img} alt="" decoding="async" onError={handleImageError} />
                    ))}
                  </span>
                ))}
              </span>
              <span className="wp-year-cut">{story.year}</span>
            </span>
            <span className="wp-year-line" aria-hidden>{story.year}</span>
          </h1>
          <p className="wp-up wp-lede" style={vars({ '--d': '200ms' })}>
            <b>{records(story.releases.length)}</b> from <b>{story.summary.uniqueArtists.toLocaleString('en-GB')} artists</b> came home{story.ytd ? ' so far' : ''}.{' '}
            {peak.name} was the busy one.
          </p>
          <dl className="wp-up wp-stats" style={vars({ '--d': '300ms' })}>
            <Stat label="Records"><Count to={story.releases.length} run={active} /></Stat>
            <Stat label="Artists"><Count to={story.summary.uniqueArtists} run={active} /></Stat>
            <Stat label="A month"><Count to={story.summary.avgPerMonth} run={active} decimals={1} /></Stat>
            <Stat label="Busiest month">{MONTHS[view.peak]}</Stat>
          </dl>
          <button type="button" className="wp-up wp-btn solid" style={vars({ '--d': '420ms' })} onClick={onPlay}>
            <Play className="h-4 w-4" fill="currentColor" aria-hidden />
            Play the year
          </button>
        </div>
      </div>
    </>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wp-stat">
      <dt className="wp-cap">{label}</dt>
      <dd className="wp-num">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------
// 2 · First & last
// ---------------------------------------------------------------------

function FirstLast({ view, active, seen }: { view: View; active: boolean; seen: boolean }) {
  return (
    <>
      <div className="wp-split">
        <Bookend release={view.first} label="First in" active={active} seen={seen} delay={0} />
        <Bookend release={view.last} label="Last in" active={active} seen={seen} delay={180} />
      </div>
      <div className="wp-in wp-apart wp-glass" style={vars({ '--d': '520ms' })}>
        <b className="wp-num">{view.days}</b>
        <span className="wp-cap">days apart</span>
      </div>
    </>
  );
}

function Bookend({ release, label, active, seen, delay }: { release: Release; label: string; active: boolean; seen: boolean; delay: number }) {
  const vinylOf = useVinylColours();
  const uri = releaseUri(release.s);
  return (
    <div className="wp-half" data-seen={seen} style={vars({ '--flood': flood(release) })}>
      <div className="wp-bg" aria-hidden>
        <img src={release.img} alt="" loading="lazy" decoding="async" onError={handleImageError} />
      </div>
      <Link to={uri} className="wp-up wp-record block" style={vars({ '--d': `${delay}ms` })} aria-label={`${release.t} by ${release.by}`}>
        <HeroRecord
          src={hiRes(release)}
          alt=""
          labelColour={release.c.ground || '#0e0d0c'}
          looks={discLooks(vinylOf(uri))}
          discOut={active ? 20 : 0}
          spinning={active}
          eager={false}
          stickerOnMobile={false}
        />
      </Link>
      <div className="wp-up min-w-0" style={vars({ '--d': `${delay + 140}ms` })}>
        <div className="wp-kicker">{label} · {shortDate(release.d)}</div>
        <Link to={uri} className="block">
          <FitTitle as="h2" max={76} min={22} className="line-clamp-3">{release.t}</FitTitle>
        </Link>
        {release.a[0] ? (
          <Link to={artistUri(release.a[0])} className="by">{release.by}</Link>
        ) : (
          <span className="by">{release.by}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 3 · Months: twelve bars, and the picked month's sleeves
// ---------------------------------------------------------------------

function Months({ story, view, active, onSelect }: { story: Story; view: View; active: number; onSelect: (m: number) => void }) {
  const month = view.months[active];
  const max = Math.max(1, ...view.months.map(m => m.list.length));
  const SHOW = 15;
  const shown = month.list.length > SHOW + 1 ? month.list.slice(0, SHOW) : month.list;
  const more = month.list.length - shown.length;
  return (
    <div className="wp-frame">
      <div className="wp-months">
        <div>
          <div className="wp-up wp-kicker">{active === view.peak ? 'The busiest month' : 'Month by month'}</div>
          <h2 key={month.name} className="wp-swap wp-head wp-month-name">{month.name}</h2>
          <p className="wp-up wp-lede mt-4" style={vars({ '--d': '120ms' })}>
            <b>{records(month.list.length)}</b>, {Math.round((month.list.length / story.releases.length) * 100)}% of the year. Pick a month to see what arrived.
          </p>
          <div className="wp-bars" role="group" aria-label="Records added each month">
            {view.months.map(m => (
              <button
                key={m.name}
                type="button"
                className="wp-bar"
                onClick={() => onSelect(m.i)}
                disabled={!m.list.length}
                aria-pressed={m.i === active}
                aria-label={`${m.name}, ${records(m.list.length)}`}
                style={vars({ '--c': m.colour })}
              >
                <span className="n">{m.list.length || ''}</span>
                <span className="col wp-grow" style={vars({ height: `${(m.list.length / max) * 100}%`, '--d': `${200 + m.i * 55}ms` })} />
                <span className="m">{MONTHS[m.i]}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div key={month.name} className="wp-month-grid" aria-label={`Records added in ${month.name}`}>
            {shown.map((r, i) => (
              <Thumb key={r.s} r={r} style={vars({ '--i': i })} />
            ))}
            {more > 0 && (
              <div className="wp-more" style={vars({ '--i': shown.length })}>
                <b className="wp-num">+{more}</b>
                <span className="wp-cap">more</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 4 · Artists: the most collected over their photograph, then the next five
// ---------------------------------------------------------------------

function Artists({ story, view }: { story: Story; view: View }) {
  const top = view.top;
  if (!top) return <Empty title="Artists" />;
  const runners = view.artists.slice(1, 6);
  const position = top.fanart ? '50% 28%' : top.focus ? `${top.focus[0] * 100}% ${top.focus[1] * 100}%` : '50% 30%';
  return (
    <>
      <div className="wp-portrait" aria-hidden>
        <img src={top.fanart || top.photo} alt="" style={{ objectPosition: position }} loading="lazy" decoding="async" onError={handleImageError} />
      </div>
      <div className="wp-frame">
        <div className="wp-artists">
          <div className="min-w-0">
            <div className="wp-up wp-kicker">Most collected in {story.year}</div>
            <Link to={artistUri(top.s)} className="wp-up block" style={vars({ '--d': '100ms' })}>
              <FitTitle as="h2" max={160} min={34} className="wp-artist-name">{top.name}</FitTitle>
            </Link>
            <p className="wp-up wp-lede mt-4" style={vars({ '--d': '200ms' })}>
              <b>{records(top.n)}</b> this year{top.new ? ', and the first time on the shelves' : ''}
              {top.from ? `. From ${top.from}` : ''}.
            </p>
            <div className="wp-up wp-artist-recs" style={vars({ '--d': '300ms' })}>
              {view.topRecords.slice(0, 7).map(r => <Thumb key={r.s} r={r} />)}
            </div>
          </div>
          {runners.length > 0 && (
            <div className="wp-up wp-glass wp-runners" style={vars({ '--d': '380ms' })}>
              <h3 className="wp-cap">Close behind</h3>
              {runners.map(a => (
                <Link key={a.s} to={artistUri(a.s)} className="wp-runner">
                  <img src={a.avatar} alt="" loading="lazy" decoding="async" onError={handleImageError} />
                  <b>{a.name}</b>
                  <span className="wp-num" aria-label={records(a.n)}>{a.n}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// 5 · Genres: the families as one bar, then the biggest by name
// ---------------------------------------------------------------------

function Genres({ story, view }: { story: Story; view: View }) {
  const top = view.fams[0];
  if (!top) return <Empty title="Genres" />;
  return (
    <div className="wp-frame">
      <div className="wp-genres">
        <div className="wp-genres-top">
          <div className="min-w-0">
            <div className="wp-up wp-kicker">The sound of {story.year}</div>
            <div className="wp-up" style={vars({ '--d': '100ms' })}>
              <div className="wp-head wp-mostly mt-3">Mostly</div>
              <FitTitle as="h2" max={150} min={20} className="wp-head wp-fam">{top.name}</FitTitle>
            </div>
          </div>
          <div className="wp-up wp-num" style={vars({ '--d': '200ms' })} aria-label={`${Math.round(top.share)} percent`}>
            {Math.round(top.share)}<small>%</small>
          </div>
        </div>
        <div className="wp-stack" role="img" aria-label="Share of the year by genre family">
          {view.fams.map(f => (
            <i key={f.key} style={vars({ '--c': f.colour, flex: `${f.list.length} 1 0` })} title={`${f.name}: ${records(f.list.length)}`} />
          ))}
        </div>
        <ol className="wp-genre-list">
          {view.fams.slice(0, 8).map((f, i) => (
            <li key={f.key} className="wp-up wp-genre" style={vars({ '--c': f.colour, '--d': `${320 + i * 60}ms` })}>
              <i aria-hidden />
              <b>{f.name}</b>
              <span className="sl" aria-hidden>
                {f.list.slice(0, 4).map(r => <img key={r.s} src={r.img} alt="" loading="lazy" decoding="async" onError={handleImageError} />)}
              </span>
              <span className="wp-num" aria-label={records(f.list.length)}>{f.list.length}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 6 · Colour: every sleeve as one bar of a waveform, in hue order
// ---------------------------------------------------------------------

function Colour({ story, view }: { story: Story; view: View }) {
  const [over, setOver] = useState<Release | null>(null);
  const discs = useMemo(() => {
    const seen = new Set<string>(), out: string[][] = [];
    for (const r of view.coloured) {
      const hex = r.vc[0].hex;
      if (!hex.length || seen.has(hex[0])) continue;
      seen.add(hex[0]);
      out.push(hex);
      if (out.length === 9) break;
    }
    return out;
  }, [view.coloured]);
  const n = view.spectrum.length;
  return (
    <div className="wp-frame">
      <div className="wp-colour">
        <div className="wp-up wp-kicker">The sleeves, by colour</div>
        <h2 className="wp-up wp-head mt-3" style={vars({ '--d': '100ms' })}>
          {story.year} in <em>colour</em>
        </h2>
        <div className="wp-wave" style={vars({ '--step': `${Math.min(8, 1400 / n)}ms`, gap: n > 160 ? 0 : 3 })} onPointerLeave={() => setOver(null)}>
          {view.spectrum.map((r, i) => (
            <Link
              key={r.s}
              to={releaseUri(r.s)}
              aria-label={`${r.t} by ${r.by}`}
              style={vars({ '--c': flood(r), '--h': `${16 + 84 * Math.min(1, (r.c.vivid ?? 0) / 1.5)}%`, '--i': i })}
              onPointerEnter={() => setOver(r)}
              onFocus={() => setOver(r)}
            />
          ))}
        </div>
        <div className="wp-up wp-colour-foot" style={vars({ '--d': '300ms' })}>
          <div className="wp-now" aria-live="polite">
            {over ? (
              <>
                <b>{over.t}</b>
                <span className="wp-cap">{over.by}</span>
              </>
            ) : (
              <span className="wp-cap">
                One bar a record, tallest where the sleeve is most vivid{view.plain ? `; ${view.plain} black, white and grey sleeves sit this one out` : ''}. Point at one.
              </span>
            )}
          </div>
          {view.coloured.length > 0 && (
            <div className="wp-discs">
              <ul aria-hidden>
                {discs.map((hex, i) => <li key={i} style={vars({ '--a': hex[0], '--b': hex[1] ?? hex[0] })} />)}
              </ul>
              <p className="wp-lede">
                <b>{view.coloured.length}</b> of the year's records {view.coloured.length === 1 ? 'is a coloured pressing' : 'are coloured pressings'}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 7 · Numbers
// ---------------------------------------------------------------------

const duration = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);

function Numbers({ story, view, active }: { story: Story; view: View; active: boolean }) {
  const hours = view.seconds / 3600;
  return (
    <div className="wp-frame">
      <div className="wp-numbers">
        <div>
          <div className="wp-up wp-kicker">By the numbers</div>
          <h2 className="wp-up wp-head mt-3" style={vars({ '--d': '100ms' })}>
            What it <em>adds up to</em>
          </h2>
        </div>
        <div className="wp-bento">
          <div className="wp-up wp-glass wp-tile wide" style={vars({ '--d': '200ms' })}>
            <div className="wp-num"><Count to={view.grams / 1000} run={active} decimals={1} /><small>kg</small></div>
            <p><b>of vinyl</b> across {view.discs.toLocaleString('en-GB')} discs<span className="x">, sleeves not included</span>.</p>
          </div>
          <div className="wp-up wp-glass wp-tile" style={vars({ '--d': '260ms' })}>
            <div className="wp-num"><Count to={hours} run={active} /><small>h</small></div>
            <p><b>of music</b><span className="x">, or {(hours / 24).toFixed(1)} days end to end</span>.</p>
          </div>
          <div className="wp-up wp-glass wp-tile" style={vars({ '--d': '320ms' })}>
            <div className="wp-num"><Count to={view.fresh} run={active} /></div>
            <p><b>artists</b> new to the shelves.</p>
          </div>
          {view.oldest && (
            <Link to={releaseUri(view.oldest.s)} className="wp-up wp-glass wp-tile" style={vars({ '--d': '380ms' })}>
              <span className="art" aria-hidden><img src={view.oldest.img} alt="" loading="lazy" decoding="async" onError={handleImageError} /></span>
              <div className="wp-num">{view.oldest.y}</div>
              <p><b>The oldest</b><span className="x">: {view.oldest.t}</span></p>
            </Link>
          )}
          {view.longest && (
            <Link to={releaseUri(view.longest.s)} className="wp-up wp-glass wp-tile" style={vars({ '--d': '440ms' })}>
              <span className="art" aria-hidden><img src={view.longest.img} alt="" loading="lazy" decoding="async" onError={handleImageError} /></span>
              <div className="wp-num" style={{ fontSize: 'clamp(26px, 3.4vw, 60px)' }}>{duration(view.longest.rt!)}</div>
              <p><b>The longest</b><span className="x">: {view.longest.t}</span></p>
            </Link>
          )}
          <div className="wp-up wp-glass wp-tile wide" style={vars({ '--d': '500ms' })}>
            <div className="row">
              {view.bigDay.slice(0, 8).map(r => <Thumb key={r.s} r={r} />)}
            </div>
            <div className="wp-num"><Count to={view.bigDay.length} run={active} /></div>
            <p><b>in one day</b>, {longDate(story.biggest)}.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 8 · Finale: the last record still turning, and where to go next
// ---------------------------------------------------------------------

function Finale({
  story,
  view,
  active,
  availableYears,
  previousYear,
  nextYear,
  onClose,
}: {
  story: Story;
  view: View;
  active: boolean;
  availableYears: number[];
  previousYear?: number;
  nextYear?: number;
  onClose: () => void;
}) {
  const vinylOf = useVinylColours();
  // Enough tiles to cover a tall screen; short years go round again.
  const wall = useMemo(() => {
    const pool = sample(story.releases, 70);
    return Array.from({ length: 140 }, (_, i) => pool[(i * 9) % pool.length]);
  }, [story.releases]);
  const last = view.last;
  return (
    <>
      <div className="wp-mosaic" aria-hidden>
        {wall.map((r, i) => <img key={i} src={r.img} alt="" loading="lazy" decoding="async" onError={handleImageError} />)}
      </div>
      <div className="wp-finale-shade" aria-hidden />
      <div className="wp-frame">
        <div className="wp-finale">
          <div className="wp-in wp-finale-disc">
            <Vinyl label={last.c.ground || '#0e0d0c'} cover={last.img} look={discLook(vinylOf(releaseUri(last.s)), 0)} spin={active} className="inset-0 h-full w-full" />
          </div>
          <h2 className="wp-up wp-head" style={vars({ '--d': '140ms' })}>
            That was <em>{story.year}</em>
          </h2>
          <p className="wp-up wp-lede" style={vars({ '--d': '220ms' })}>
            {records(story.releases.length)}, ending on <b>{last.t}</b> by {last.by}.
          </p>
          <div className="wp-up wp-finale-actions" style={vars({ '--d': '300ms' })}>
            {previousYear && (
              <Link to={`/wrapped/${previousYear}`} className="wp-btn" aria-label={`Previous year, ${previousYear}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {previousYear}
              </Link>
            )}
            <button type="button" className="wp-btn solid" onClick={onClose}>
              <LayoutList className="h-4 w-4" aria-hidden />
              The full year page
            </button>
            {nextYear && (
              <Link to={`/wrapped/${nextYear}`} className="wp-btn" aria-label={`Next year, ${nextYear}`}>
                {nextYear}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
          <nav aria-label="All Wrapped years" className="wp-up" style={vars({ '--d': '380ms' })}>
            <ul className="wp-years">
              {availableYears.map(year => (
                <li key={year}>
                  <Link to={`/wrapped/${year}`} aria-current={year === story.year ? 'page' : undefined}>{year}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
}

function Empty({ title }: { title: string }) {
  return (
    <div className="wp-frame">
      <div className="m-auto text-center">
        <h2 className="wp-head">{title}</h2>
        <p className="wp-lede mt-4">Nothing to show for this year.</p>
      </div>
    </div>
  );
}
