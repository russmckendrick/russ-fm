import { useState, useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LayoutList, Presentation } from 'lucide-react';
import { ArtistCard } from '@/components/ArtistCard';
import { AFTER_HERO, CoverHero, HeroRecord, PillLink, RecordTile, SectionHeading, usePageFlood } from '@/components/player';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { appConfig } from '@/config/app.config';
import { getAlbumImageFromData, getAlbumImageSrcSet, getAlbumSlug, getArtistImageFromData } from '@/lib/image-utils';
import { loadCollection } from '@/lib/collection';
import { slugify } from '@/lib/browseFacets';
import { NEUTRAL_FLOOD } from '@/lib/sleeveColour';
import type { WrappedData, WrappedRelease } from '@/types/wrapped';
import { YearSelector } from './components/YearSelector';
import { WrappedPresentation } from './WrappedPresentation';
import {
  artistUri,
  decadeOf,
  floodForRelease,
  formatDay,
  groupColour,
  paletteForRelease,
  paletteForSlug,
  releaseUri,
  tileAlbum,
  type ColourMap,
} from './utils/sleeves';

type ViewMode = 'grid' | 'presentation';
type TimelineMonth = WrappedData['insights']['timeline'][number];

const WRAP = 'mx-auto w-full max-w-[1640px] px-5 md:px-10 lg:px-14';

/**
 * `/wrapped/:year` — the year's records in the player look. The page floods
 * with the colour of the year's first addition (the nav follows), then
 * headline counts, a month chart built from the sleeves added that month,
 * top artists, genre/decade bars in sleeve colours and a shelf per month.
 * The full-screen presentation is one button away.
 */
export function WrappedYear() {
  const { year } = useParams<{ year: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const colours = useAlbumColorMap();

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

  const releases = useMemo(
    () =>
      (data?.releases ?? [])
        .map(r => r.release)
        .sort((a, b) => new Date(a.date_added).getTime() - new Date(b.date_added).getTime()),
    [data],
  );
  const heroRelease = releases[0];
  const flood = useMemo(() => floodForRelease(colours, heroRelease), [colours, heroRelease]);
  const paint = useMemo(() => (data ? buildPaint(data, releases, colours) : null), [data, releases, colours]);

  const showHero = !loading && !!data && viewMode === 'grid';
  usePageFlood(showHero ? flood.flood : null, showHero ? flood.ink : null);

  if (!year || !yearNum || Number.isNaN(yearNum)) {
    return <Navigate to={`/wrapped/${currentYear - 1}`} replace />;
  }

  if (loading) return <WrappedSkeleton year={yearNum} />;

  if (error || !data || !paint) {
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
        <div className="fixed right-3 top-3 z-[80] flex items-center gap-2 rounded-full bg-[rgba(14,13,12,.78)] p-1.5 text-[color:var(--cream)] backdrop-blur-md md:right-5 md:top-4">
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
        <WrappedPresentation data={data} availableYears={availableYears} previousYear={previousYear} nextYear={nextYear} />
      </div>
    );
  }

  const { summary, insights } = data;
  const artists = mergeArtists(data).slice(0, 12);
  const monthsWithReleases = insights.timeline.filter(m => m.releases.length > 0);
  const heroUri = heroRelease ? releaseUri(heroRelease.slug) : null;
  const heroArtist = heroRelease?.artists[0];

  return (
    <div className="bg-[var(--ground)] text-[color:var(--cream)]">
      <CoverHero
        flood={flood}
        art={
          heroRelease && heroUri ? (
            <HeroRecord
              src={getAlbumImageFromData(heroUri, 'hi-res')}
              srcSet={getAlbumImageSrcSet(getAlbumSlug(heroUri))}
              alt={`${heroRelease.release_name} by ${heroRelease.release_artist}`}
              labelColour={flood.ground}
              labelText={String(yearNum)}
              discOut={20}
              sticker={{ date: heroRelease.date_added, background: flood.ink, color: flood.flood, label: 'First in' }}
            />
          ) : null
        }
      >
        <div className="t-kicker" style={{ color: flood.sub }}>
          Wrapped{data.isYearToDate ? ' · Year to date' : ''}
        </div>
        <h1 className="t-disp m-0 mt-3 text-[clamp(88px,15vw,232px)]">{yearNum}</h1>

        {heroRelease && heroUri && (
          <div className="mt-8 min-w-0">
            <div className="t-mono text-[12px] font-bold uppercase" style={{ color: flood.sub }}>
              First added · {formatDay(heroRelease.date_added, false)}
            </div>
            <Link to={heroUri} className="t-cond mt-2 block text-[length:var(--fs-phone)] hover:underline lg:text-[length:var(--fs-desk)]" style={titleSize(heroRelease.release_name)}>
              {heroRelease.release_name}
            </Link>
            {heroArtist ? (
              <Link to={artistUri(heroArtist.slug)} className="t-dispn mt-3 inline-block text-[20px] hover:underline md:text-[26px]">
                {heroRelease.release_artist}
              </Link>
            ) : (
              <div className="t-dispn mt-3 text-[20px] md:text-[26px]">{heroRelease.release_artist}</div>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setViewMode('presentation')}
            className="pill pill-solid"
            style={{ background: flood.ink, color: flood.flood }}
          >
            <Presentation className="h-4 w-4" aria-hidden />
            Presentation
          </button>
          <YearSelector currentYear={yearNum} availableYears={availableYears} onYearChange={y => navigate(`/wrapped/${y}`)} />
        </div>
      </CoverHero>

      {/* Headline counts ------------------------------------------- */}
      <section className={`${WRAP} ${AFTER_HERO}`}>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4 lg:gap-x-10">
          <BigCount label="Records" value={summary.totalReleases.toLocaleString('en-GB')} colour={paint.headline[0]} />
          <BigCount label="Artists" value={summary.uniqueArtists.toLocaleString('en-GB')} colour={paint.headline[1]} />
          <BigCount label="Per month" value={summary.avgPerMonth.toFixed(1)} colour={paint.headline[2]} />
          <BigCount label="Busiest month" value={summary.peakMonth || '—'} colour={paint.headline[3]} />
        </dl>
        <dl className="mt-12 grid grid-cols-2 gap-x-5 gap-y-8 border-t border-[color:var(--cream-rule)] pt-8 sm:grid-cols-3 lg:grid-cols-4">
          {summary.topGenre && <SmallCount label="Top genre" value={summary.topGenre} />}
          {summary.topStyle && <SmallCount label="Top style" value={summary.topStyle} />}
          <SmallCount
            label="Records per artist"
            value={(summary.totalReleases / Math.max(1, summary.uniqueArtists)).toFixed(1)}
          />
          {data.isYearToDate && summary.projectedTotal ? (
            <SmallCount label="On pace for" value={summary.projectedTotal.toLocaleString('en-GB')} />
          ) : null}
        </dl>
      </section>

      {/* Month chart ----------------------------------------------- */}
      {insights.timeline.length > 0 && (
        <Section>
          <SectionHeading title="Added per month" note="One block per record" />
          <MonthColumns className="mt-8" timeline={insights.timeline} releaseColour={paint.release} />
        </Section>
      )}

      {/* Top artists ----------------------------------------------- */}
      {artists.length > 0 && (
        <Section>
          <SectionHeading title="Top artists" />
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {artists.map(a => (
              <ArtistCard
                key={a.slug}
                artist={{
                  name: a.name,
                  uri: artistUri(a.slug),
                  albumCount: a.count,
                  image: getArtistImageFromData(artistUri(a.slug), 'medium'),
                }}
                palette={paint.artistPalette(a)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Genres + decades ------------------------------------------ */}
      {(insights.genres.length > 0 || insights.decades.length > 0) && (
        <Section className="grid gap-14 lg:grid-cols-2 lg:gap-16">
          {insights.genres.length > 0 && (
            <div>
              <SectionHeading title="Genres" size="sm" />
              <ColourBars
                className="mt-8"
                items={insights.genres.slice(0, 8).map(g => ({
                  name: g.name,
                  count: g.count,
                  note: `${g.percentage.toFixed(0)}%`,
                  colour: paint.genre[g.name],
                  to: `/genre/${slugify(g.name)}`,
                }))}
              />
            </div>
          )}
          {insights.decades.length > 0 && (
            <div>
              <SectionHeading title="Decades" size="sm" />
              <ColourBars
                className="mt-8"
                big
                items={[...insights.decades]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(d => ({ name: d.name, count: d.count, colour: paint.decade[d.name], to: `/decade/${slugify(d.name)}` }))}
              />
            </div>
          )}
        </Section>
      )}

      {/* Month by month -------------------------------------------- */}
      {monthsWithReleases.length > 0 && (
        <Section>
          <SectionHeading title="Month by month" note={`${summary.totalReleases.toLocaleString('en-GB')} records`} />
          <div className="mt-10 flex flex-col gap-14">
            {monthsWithReleases.map(m => (
              <MonthShelf key={m.month} month={m} colour={paint.month[m.month] ?? NEUTRAL_FLOOD} colours={colours} />
            ))}
          </div>
        </Section>
      )}

      {/* Years ----------------------------------------------------- */}
      <Section className="pb-16 md:pb-24">
        <SectionHeading title="Years" size="sm" />
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {previousYear && (
            <Link to={`/wrapped/${previousYear}`} className="pill" aria-label={`Previous year, ${previousYear}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {previousYear}
            </Link>
          )}
          {nextYear && (
            <Link to={`/wrapped/${nextYear}`} className="pill" aria-label={`Next year, ${nextYear}`}>
              {nextYear}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
        {availableYears.length > 0 && (
          <nav aria-label="All Wrapped years" className="mt-6 flex flex-wrap gap-2">
            {availableYears.map(y => {
              const on = y === yearNum;
              return (
                <Link
                  key={y}
                  to={`/wrapped/${y}`}
                  aria-current={on ? 'page' : undefined}
                  className={`pill pill-sm t-mono ${on ? 'pill-solid' : 'border-[color:var(--cream-rule)] text-[color:var(--cream-dim)] hover:text-[color:var(--cream)]'}`}
                  style={on ? { background: flood.flood, color: flood.ink } : undefined}
                >
                  {y}
                </Link>
              );
            })}
          </nav>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------

function Section({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`${WRAP} pt-16 md:pt-24`}>
      <div className={className}>{children}</div>
    </section>
  );
}

function BigCount({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-3">
      <dt className="t-kicker text-[color:var(--cream-dim)]">{label}</dt>
      <dd
        className={`t-cond m-0 truncate tabular-nums ${value.length > 5 ? 'text-[clamp(36px,7vw,120px)]' : 'text-[clamp(56px,11vw,168px)]'}`}
        title={value}
      >
        {value}
      </dd>
      <span className="block h-1.5 w-16 rounded-full" style={{ background: colour }} aria-hidden />
    </div>
  );
}

function SmallCount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-2">
      <dt className="t-mono text-[11px] uppercase text-[color:var(--cream-dim)]">{label}</dt>
      <dd className="t-cond m-0 truncate text-[36px] md:text-[52px]">{value}</dd>
    </div>
  );
}

interface BarItem {
  name: string;
  count: number;
  note?: string;
  colour?: string;
  to?: string;
}

function ColourBars({ items, big, className }: { items: BarItem[]; big?: boolean; className?: string }) {
  const max = Math.max(1, ...items.map(i => i.count));
  return (
    <ul className={`m-0 flex list-none flex-col gap-4 p-0 ${className ?? ''}`}>
      {items.map(item => {
        const row = (
          <>
            <span className="flex min-w-0 items-baseline justify-between gap-4">
              <span className={big ? 't-cond truncate text-[30px] md:text-[36px]' : 'truncate text-[16px] font-bold md:text-[17px]'}>{item.name}</span>
              <span className="t-mono shrink-0 text-[12px] tabular-nums text-[color:var(--cream-dim)]">
                {item.count.toLocaleString('en-GB')}
                {item.note ? ` · ${item.note}` : ''}
              </span>
            </span>
            <span className="mt-2 block h-3 overflow-hidden rounded-full bg-[var(--ground-3)]">
              <span
                className="block h-full rounded-full transition-[filter] duration-300 group-hover:brightness-110"
                style={{ width: `${Math.max(2, (item.count / max) * 100)}%`, background: item.colour ?? NEUTRAL_FLOOD }}
              />
            </span>
          </>
        );
        return (
          <li key={item.name}>
            {item.to ? (
              <Link to={item.to} className="group block min-h-[44px] rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cream)]">
                {row}
              </Link>
            ) : (
              <div className="min-h-[44px]">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Twelve columns, each a stack of that month's sleeves in their colours. Links to the month's shelf. */
function MonthColumns({ timeline, releaseColour, className }: { timeline: TimelineMonth[]; releaseColour: Record<string, string>; className?: string }) {
  const max = Math.max(1, ...timeline.map(m => m.releases.length));
  return (
    <ol
      className={`m-0 grid list-none gap-1 p-0 sm:gap-2 md:gap-3 ${className ?? ''}`}
      style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(0, 1fr))` }}
    >
      {timeline.map(m => {
        const stack = (
          <span className="flex h-[220px] w-full flex-col-reverse md:h-[300px]">
            {m.releases.map((r, i) => (
              <span
                key={`${r.slug}-${i}`}
                className="block w-full shrink-0 border-t border-[color:var(--ground)] first:rounded-b-[3px] last:rounded-t-[3px]"
                style={{ height: `${100 / max}%`, background: releaseColour[r.slug] ?? NEUTRAL_FLOOD }}
              />
            ))}
          </span>
        );
        return (
          <li key={m.month} className="flex min-w-0 flex-col items-stretch">
            {m.releases.length > 0 ? (
              <a
                href={`#month-${slugify(m.month)}`}
                aria-label={`${m.month}: ${m.releases.length} ${m.releases.length === 1 ? 'record' : 'records'}`}
                className="block rounded outline-none transition-opacity duration-200 hover:opacity-85 focus-visible:ring-2 focus-visible:ring-[color:var(--cream)]"
              >
                {stack}
              </a>
            ) : (
              <span aria-label={`${m.month}: none`} role="img">
                {stack}
              </span>
            )}
            <span className="mt-2 block h-px w-full bg-[color:var(--cream-rule)]" aria-hidden />
            <span className="t-mono mt-2 text-center text-[10px] uppercase sm:text-[12px]" aria-hidden>
              {m.month.slice(0, 3)}
            </span>
            <span className="t-mono text-center text-[10px] tabular-nums text-[color:var(--cream-dim)] sm:text-[11px]" aria-hidden>
              {m.releases.length}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MonthShelf({ month, colour, colours }: { month: TimelineMonth; colour: string; colours: ColourMap }) {
  return (
    <div id={`month-${slugify(month.month)}`} className="scroll-mt-24">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: colour }} aria-hidden />
        <h3 className="t-disp m-0 text-[28px] md:text-[40px]">{month.month}</h3>
        <span className="t-mono text-[12px] uppercase text-[color:var(--cream-dim)]">
          {month.releases.length} {month.releases.length === 1 ? 'record' : 'records'}
        </span>
      </div>
      <div className="shelf-scroll -mx-5 mt-6 gap-5 px-5 pb-6 md:-mx-10 md:px-10 lg:-mx-14 lg:px-14" aria-label={`${month.month} records`}>
        {month.releases.map((r, i) => (
          <RecordTile
            key={`${r.slug}-${i}`}
            album={tileAlbum(r)}
            palette={paletteForRelease(colours, r)}
            meta={formatDay(r.date_added, false)}
            className="w-[150px] shrink-0 md:w-[190px]"
          />
        ))}
      </div>
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

// ---------------------------------------------------------------------

type YearArtist = WrappedData['insights']['topArtists'][number] | WrappedData['insights']['artists'][number];

/** Top artists first, then the wider artist list, without repeats. */
function mergeArtists(data: WrappedData): YearArtist[] {
  const seen = new Set<string>();
  const out: YearArtist[] = [];
  for (const a of [...data.insights.topArtists, ...data.insights.artists]) {
    if (seen.has(a.slug)) continue;
    seen.add(a.slug);
    out.push(a);
  }
  return out;
}

function buildPaint(data: WrappedData, releases: WrappedRelease[], colours: ColourMap) {
  const release: Record<string, string> = {};
  for (const r of releases) release[r.slug] = floodForRelease(colours, r).flood;
  for (const m of data.insights.timeline) {
    for (const r of m.releases) release[r.slug] ??= floodForRelease(colours, r).flood;
  }

  const month: Record<string, string> = {};
  const usedMonths = new Set<string>();
  for (const m of data.insights.timeline) month[m.month] = groupColour(m.releases, colours, usedMonths);

  const usedGenres = new Set<string>();
  const genre = Object.fromEntries(
    data.insights.genres.map(g => [g.name, groupColour(releases.filter(r => r.genre_names.includes(g.name)), colours, usedGenres)]),
  );

  const usedDecades = new Set<string>();
  const decade = Object.fromEntries(
    data.insights.decades.map(d => [d.name, groupColour(releases.filter(r => decadeOf(r) === d.name), colours, usedDecades)]),
  );

  const byArtist = (slug: string) => releases.filter(r => r.artists.some(a => a.slug === slug));

  const usedHeadline = new Set<string>();
  const top = mergeArtists(data);
  const peak = data.insights.timeline.find(m => m.month === data.summary.peakMonth);
  const headline = [
    groupColour(releases.slice(-1), colours, usedHeadline),
    groupColour(top[0] ? byArtist(top[0].slug) : [], colours, usedHeadline),
    groupColour(releases.slice(1), colours, usedHeadline),
    groupColour(peak?.releases ?? [], colours, usedHeadline),
  ];

  return {
    release,
    month,
    genre,
    decade,
    headline,
    artistPalette: (artist: YearArtist) => {
      const topAlbum = 'topAlbum' in artist ? artist.topAlbum : undefined;
      if (topAlbum) {
        const p = paletteForSlug(colours, topAlbum.slug);
        if (p) return p;
      }
      return paletteForRelease(colours, byArtist(artist.slug)[0]);
    },
  };
}

/** Condensed title sized so its longest word fits the text column (full width on phones, beside the cover on desktop). */
function titleSize(title: string): CSSProperties {
  const longest = Math.max(4, ...title.split(/\s+/).map(w => w.length));
  const phone = 86 / (longest * 0.52);
  const desk = 36 / (longest * 0.52);
  return {
    '--fs-phone': `clamp(28px, ${phone.toFixed(2)}vw, 72px)`,
    '--fs-desk': `clamp(32px, ${desk.toFixed(2)}vw, 88px)`,
  } as CSSProperties;
}
