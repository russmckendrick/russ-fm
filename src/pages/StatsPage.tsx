import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArtistCard } from '@/components/ArtistCard';
import { RecordTile, SectionHeading, Sleeve } from '@/components/player';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColorMap, type AlbumColorPalette } from '@/hooks/useAlbumColors';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { getAlbumImageFromData, getArtistImageFromData } from '@/lib/image-utils';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { loadCollection } from '@/lib/collection';
import { slugify } from '@/lib/browseFacets';
import { NEUTRAL_FLOOD, floodFor, inkOn, subInk, vividFrom } from '@/lib/sleeveColour';
import { appConfig } from '@/config/app.config';
import { redesignConfig } from '@/config/redesign.config';
import type { Album } from '@/types/album';

interface ArtistStat {
  name: string;
  uri: string;
  albums: Album[];
  albumCount: number;
  image: string;
}

interface RankedStat {
  name: string;
  count: number;
  albums: Album[];
}

interface MonthStat {
  /** YYYY-MM */
  key: string;
  label: string;
  year: number;
  albums: Album[];
}

export interface CollectionStats {
  albums: Album[];
  totalAlbums: number;
  uniqueArtists: number;
  uniqueGenres: number;
  uniqueLabels: number;
  uniqueCountries: number;
  avgAlbumsPerArtist: string;
  topArtists: ArtistStat[];
  topGenres: RankedStat[];
  decadeData: RankedStat[];
  months: MonthStat[];
  addedYears: RankedStat[];
  firstAdded: Album | null;
  recentAdditions: Album[];
  randomAlbums: Album[];
  randomArtists: ArtistStat[];
  goldenYear: RankedStat | null;
  topYears: RankedStat[];
  oneHitWonders: number;
  catalogArtists: number;
  mostActiveMonth: { month: string; count: number } | null;
  formatData: RankedStat[];
  topLabels: RankedStat[];
  topCountries: RankedStat[];
  hiddenGems: Album[];
}

type ColourMap = Record<string, AlbumColorPalette> | null;

const WRAP = 'mx-auto w-full max-w-[1640px] px-5 md:px-10 lg:px-14';

/**
 * Collection statistics in the player look: huge condensed counts, then
 * charts and bars painted in the colours of the sleeves they count (a month
 * bar is a stack of that month's records, a genre bar takes the colour of a
 * well-known record in that genre). Boxset members are excluded throughout.
 */
export function StatsPage() {
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const colours = useAlbumColorMap();

  usePageTitle('Collection Statistics | Russ.fm');
  useMetaTags({
    title: 'Collection Statistics | Russ.fm',
    description: stats?.totalAlbums
      ? `${stats.totalAlbums} albums across ${stats.uniqueGenres} genres by ${stats.uniqueArtists} artists.`
      : 'Explore comprehensive statistics about my vinyl and music collection on Russ.fm',
    image: `${appConfig.siteUrl}/og-image.png`,
    url: `${appConfig.siteUrl}/stats`,
    type: 'website',
  });

  useEffect(() => {
    let alive = true;
    loadCollection()
      .then(data => {
        if (alive) setStats(calculateStats(excludeBoxsetMembers(data)));
      })
      .catch(err => {
        console.error('Error loading collection:', err);
        if (alive) setError('The collection could not be loaded.');
      });
    return () => {
      alive = false;
    };
  }, []);

  // Per-album flood colour, and one representative colour per group.
  const paint = useMemo(() => (stats ? buildPaint(stats, colours) : null), [stats, colours]);

  if (error) {
    return (
      <div className={`${WRAP} py-16`}>
        <h1 className="t-disp m-0 text-[48px] md:text-[80px]">Stats</h1>
        <p className="t-mono mt-6 text-[13px] text-[color:var(--cream-dim)]">{error}</p>
      </div>
    );
  }

  if (!stats || !paint) return <StatsSkeleton />;

  const since = stats.firstAdded ? formatMonth(new Date(stats.firstAdded.date_added)) : null;
  const threshold = redesignConfig.stats.hiddenGemsListenersThreshold;

  return (
    <div className="bg-[var(--ground)] pb-10 text-[color:var(--cream)]">
      {/* Title + headline counts ------------------------------------- */}
      <header className={`${WRAP} pt-10 md:pt-16`}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h1 className="t-disp m-0 text-[56px] md:text-[96px] lg:text-[128px]">Stats</h1>
          {since && <span className="t-mono text-[13px] uppercase text-[color:var(--cream-dim)]">Since {since}</span>}
        </div>

        <dl className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 md:mt-14 lg:grid-cols-4 lg:gap-x-10">
          <BigCount label="Records" value={stats.totalAlbums.toLocaleString('en-GB')} colour={paint.headline[0]} />
          <BigCount label="Artists" value={stats.uniqueArtists.toLocaleString('en-GB')} colour={paint.headline[1]} />
          <BigCount label="Genres" value={stats.uniqueGenres.toLocaleString('en-GB')} colour={paint.headline[2]} />
          <BigCount label="Records per artist" value={stats.avgAlbumsPerArtist} colour={paint.headline[3]} />
        </dl>

        <dl className="mt-12 grid grid-cols-2 gap-x-5 gap-y-8 border-t border-[color:var(--cream-rule)] pt-8 sm:grid-cols-3 lg:grid-cols-5">
          <SmallCount label="Labels" value={stats.uniqueLabels.toLocaleString('en-GB')} />
          <SmallCount label="Countries" value={stats.uniqueCountries.toLocaleString('en-GB')} />
          <SmallCount label="One-record artists" value={stats.oneHitWonders.toLocaleString('en-GB')} />
          <SmallCount label="Artists with 5+" value={stats.catalogArtists.toLocaleString('en-GB')} />
          {stats.mostActiveMonth && (
            <SmallCount
              label={`Busiest month · ${stats.mostActiveMonth.count.toLocaleString('en-GB')} added`}
              value={stats.mostActiveMonth.month}
            />
          )}
        </dl>
      </header>

      {/* Additions per month ----------------------------------------- */}
      {stats.months.length > 0 && (
        <Section>
          <SectionHeading title="Added per month" note={`${stats.months.length} months · one block per record`} />
          <div className="mt-8">
            <MonthStackChart months={stats.months} albumColour={paint.album} />
          </div>
        </Section>
      )}

      {/* Growth ------------------------------------------------------ */}
      {stats.addedYears.length > 1 && (
        <Section>
          <SectionHeading title="Growth" note={`${stats.totalAlbums.toLocaleString('en-GB')} records in total`} />
          <div className="mt-8">
            <GrowthChart months={stats.months} yearColour={paint.addedYear} />
          </div>
        </Section>
      )}

      {/* Decades + genres -------------------------------------------- */}
      <Section className="grid gap-14 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading title="Decades" size="sm" link={{ to: '/decades', label: 'All decades' }} />
          <ColourBars
            className="mt-8"
            big
            items={stats.decadeData.slice(-redesignConfig.stats.decadeBarsMaxDecades).map(d => ({
              name: d.name,
              count: d.count,
              colour: paint.decade[d.name],
              to: `/decade/${slugify(d.name)}`,
            }))}
          />
        </div>
        <div>
          <SectionHeading title="Genres" size="sm" link={{ to: '/genres', label: 'All genres' }} />
          <ColourBars
            className="mt-8"
            total={stats.totalAlbums}
            items={stats.topGenres.map(g => ({
              name: g.name,
              count: g.count,
              colour: paint.genre[g.name],
              to: `/genre/${slugify(g.name)}`,
            }))}
          />
        </div>
      </Section>

      {/* Release years ----------------------------------------------- */}
      {stats.goldenYear && (
        <Section className="grid gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <GoldenYear year={stats.goldenYear} colour={paint.releaseYear[stats.goldenYear.name] ?? NEUTRAL_FLOOD} />
          <div>
            <SectionHeading title="Release years" size="sm" note={`Top ${stats.topYears.length}`} />
            <ColourBars
              className="mt-8"
              big
              items={stats.topYears.map(y => ({ name: y.name, count: y.count, colour: paint.releaseYear[y.name] }))}
            />
          </div>
        </Section>
      )}

      {/* Top artists ------------------------------------------------- */}
      {stats.topArtists.length > 0 && (
        <Section>
          <SectionHeading title="Most collected" link={{ to: '/artists/1', label: 'All artists' }} />
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {stats.topArtists.map(a => (
              <ArtistCard key={a.name} artist={a} palette={paint.artistPalette(a)} />
            ))}
          </div>
        </Section>
      )}

      {/* Formats + countries ----------------------------------------- */}
      <Section className="grid gap-14 lg:grid-cols-2 lg:gap-16">
        {stats.formatData.length > 0 && (
          <div>
            <SectionHeading title="Formats" size="sm" />
            <FormatBar className="mt-8" total={stats.totalAlbums} items={stats.formatData} colours={paint.format} />
          </div>
        )}
        {stats.topCountries.length > 0 && (
          <div>
            <SectionHeading title="Countries" size="sm" link={{ to: '/countries', label: 'All countries' }} />
            <ColourBars
              className="mt-8"
              items={stats.topCountries.map(c => ({
                name: c.name,
                count: c.count,
                colour: paint.country[c.name],
                to: `/country/${slugify(c.name)}`,
              }))}
            />
          </div>
        )}
      </Section>

      {/* Labels ------------------------------------------------------ */}
      {stats.topLabels.length > 0 && (
        <Section>
          <SectionHeading title="Labels" link={{ to: '/labels', label: 'All labels' }} />
          <ChipCloud
            className="mt-8"
            items={stats.topLabels.map(l => ({
              name: l.name,
              count: l.count,
              colour: paint.label[l.name],
              to: `/label/${slugify(l.name)}`,
            }))}
          />
        </Section>
      )}

      {/* Latest additions -------------------------------------------- */}
      {stats.recentAdditions.length > 0 && (
        <Section>
          <SectionHeading title="Latest additions" link={{ to: '/albums/1', label: 'All albums' }} />
          <div className="shelf-scroll -mx-5 mt-8 gap-5 px-5 pb-6 md:-mx-10 md:px-10 lg:-mx-14 lg:px-14">
            {stats.recentAdditions.map(a => (
              <RecordTile
                key={a.uri_release}
                album={a}
                palette={paint.palette(a)}
                meta={formatDay(a.date_added)}
                className="w-[150px] shrink-0 md:w-[200px]"
              />
            ))}
          </div>
        </Section>
      )}

      {/* Hidden gems ------------------------------------------------- */}
      {stats.hiddenGems.length > 0 && (
        <Section>
          <SectionHeading title="Hidden gems" note={`Under ${threshold.toLocaleString('en-GB')} Last.fm listeners`} />
          <TileGrid>
            {stats.hiddenGems.map(a => (
              <RecordTile
                key={a.uri_release}
                album={a}
                palette={paint.palette(a)}
                meta={`${(a.lastfm_listeners ?? 0).toLocaleString('en-GB')} listeners`}
              />
            ))}
          </TileGrid>
        </Section>
      )}

      {/* Random picks ------------------------------------------------ */}
      {stats.randomAlbums.length > 0 && (
        <Section>
          <SectionHeading title="Random picks" link={{ to: '/random', label: 'More' }} />
          <TileGrid>
            {stats.randomAlbums.map(a => (
              <RecordTile key={a.uri_release} album={a} palette={paint.palette(a)} />
            ))}
          </TileGrid>
        </Section>
      )}

      {stats.randomArtists.length > 0 && (
        <Section>
          <SectionHeading title="Random artists" />
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {stats.randomArtists.map(a => (
              <ArtistCard key={a.name} artist={a} palette={paint.artistPalette(a)} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------

function Section({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`${WRAP} pt-16 md:pt-24`}>
      <div className={className}>{children}</div>
    </section>
  );
}

function TileGrid({ children }: { children: ReactNode }) {
  return <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{children}</div>;
}

function BigCount({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-3">
      <dt className="t-kicker text-[color:var(--cream-dim)]">{label}</dt>
      <dd className="t-cond m-0 whitespace-nowrap text-[clamp(56px,8vw,140px)] tabular-nums">{value}</dd>
      <span className="block h-1.5 w-16 rounded-full" style={{ background: colour }} aria-hidden />
    </div>
  );
}

function SmallCount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-2">
      <dt className="t-mono text-[11px] uppercase text-[color:var(--cream-dim)]">{label}</dt>
      <dd className="t-cond m-0 truncate text-[36px] md:text-[56px]">{value}</dd>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className={`${WRAP} py-10 md:py-16`} aria-busy="true" aria-label="Loading stats">
      <div className="t-disp text-[56px] md:text-[96px] lg:text-[128px]">Stats</div>
      <div className="mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[clamp(80px,12vw,180px)] animate-pulse rounded-2xl bg-[var(--ground-2)] motion-reduce:animate-none" />
        ))}
      </div>
      <div className="mt-16 h-[240px] animate-pulse rounded-2xl bg-[var(--ground-2)] motion-reduce:animate-none" />
    </div>
  );
}

// ---------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------

interface BarItem {
  name: string;
  count: number;
  colour?: string;
  to?: string;
}

/** Horizontal bars, each filled with a sleeve colour. */
function ColourBars({ items, total, big, className }: { items: BarItem[]; total?: number; big?: boolean; className?: string }) {
  if (!items.length) return null;
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
                {total ? ` · ${Math.round((item.count / total) * 100)}%` : ''}
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

/** Label chips, sized by count, filled with a representative sleeve colour. */
function ChipCloud({ items, className }: { items: BarItem[]; className?: string }) {
  const max = Math.max(1, ...items.map(i => i.count));
  return (
    <ul className={`m-0 flex list-none flex-wrap gap-3 p-0 ${className ?? ''}`}>
      {items.map(item => {
        const bg = item.colour ?? NEUTRAL_FLOOD;
        const fs = Math.round(15 + (item.count / max) * 13);
        return (
          <li key={item.name} className="max-w-full">
            <Link
              to={item.to ?? '#'}
              className="chip max-w-full min-h-[44px]"
              style={{ background: bg, color: inkOn(bg), fontSize: fs, padding: `${Math.round(fs * 0.4)}px ${Math.round(fs * 0.85)}px` }}
            >
              <span className="t-dispn truncate">{item.name}</span>
              <span className="t-mono text-[12px] font-bold opacity-75">{item.count.toLocaleString('en-GB')}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** One full-width bar split by format, with a legend. */
function FormatBar({ items, total, colours, className }: { items: RankedStat[]; total: number; colours: Record<string, string>; className?: string }) {
  return (
    <div className={className}>
      <div className="flex h-14 w-full overflow-hidden rounded-full bg-[var(--ground-3)]" role="img" aria-label={items.map(f => `${f.name} ${f.count}`).join(', ')}>
        {items.map(f => (
          <span
            key={f.name}
            className="block h-full border-r-2 border-[color:var(--ground)] last:border-r-0"
            style={{ width: `${(f.count / total) * 100}%`, background: colours[f.name] ?? NEUTRAL_FLOOD }}
            title={`${f.name}: ${f.count}`}
          />
        ))}
      </div>
      <ul className="m-0 mt-6 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        {items.map(f => (
          <li key={f.name} className="flex min-w-0 items-center gap-3">
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: colours[f.name] ?? NEUTRAL_FLOOD }} aria-hidden />
            <span className="truncate text-[16px] font-bold">{f.name}</span>
            <span className="t-mono ml-auto shrink-0 text-[12px] tabular-nums text-[color:var(--cream-dim)]">
              {f.count.toLocaleString('en-GB')} · {((f.count / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Colour panel for the release year with the most records, with a few of its sleeves. */
function GoldenYear({ year, colour }: { year: RankedStat; colour: string }) {
  const ink = inkOn(colour);
  const sleeves = [...year.albums].sort(byListeners).slice(0, 4);
  return (
    <div className="flood-surface flex flex-col justify-between gap-8 rounded-3xl p-6 md:p-8" style={{ background: colour, color: ink }}>
      <div>
        <div className="t-kicker" style={{ color: subInk(ink) }}>
          Most records released in
        </div>
        <div className="t-cond mt-3 text-[clamp(96px,16vw,200px)]">{year.name}</div>
        <div className="t-mono mt-2 text-[13px] font-bold">{year.count.toLocaleString('en-GB')} records</div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {sleeves.map(a => (
          <Link key={a.uri_release} to={a.uri_release} aria-label={`${a.release_name} by ${a.release_artist}`} className="block">
            <Sleeve src={getAlbumImageFromData(a.uri_release, 'medium')} alt="" className="aspect-square w-full" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Records added per month: every record is a block in its sleeve colour. */
function MonthStackChart({ months, albumColour }: { months: MonthStat[]; albumColour: Record<string, string> }) {
  const max = Math.max(1, ...months.map(m => m.albums.length));
  const colW = 10;
  const W = months.length * colW;
  const H = 280;
  const unit = H / max;
  const gap = unit > 3 ? 0.8 : 0;
  const peak = months.reduce((best, m) => (m.albums.length > best.albums.length ? m : best), months[0]);
  const ticks = yearTicks(months);

  return (
    <figure className="m-0">
      <div className="flex items-end gap-4">
        <div className="t-mono flex h-[200px] w-10 shrink-0 flex-col justify-between text-right text-[11px] text-[color:var(--cream-dim)] md:h-[300px]" aria-hidden>
          <span>{max}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-[200px] min-w-0 flex-1 md:h-[300px]"
          role="img"
          aria-label={`Records added per month from ${months[0].label} to ${months[months.length - 1].label}. Busiest: ${peak.label}, ${peak.albums.length} records.`}
          shapeRendering="crispEdges"
        >
          {months.map((m, i) => (
            <g key={m.key} className="transition-opacity duration-200 hover:opacity-80">
              <title>{`${m.label}: ${m.albums.length}`}</title>
              <rect x={i * colW} y={0} width={colW} height={H} fill="transparent" />
              {m.albums.map((a, j) => (
                <rect
                  key={a.uri_release}
                  x={i * colW + 1}
                  y={H - (j + 1) * unit + gap / 2}
                  width={colW - 2}
                  height={Math.max(0.5, unit - gap)}
                  fill={albumColour[a.uri_release] ?? NEUTRAL_FLOOD}
                />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <YearAxis ticks={ticks} total={months.length} />
      <figcaption className="t-mono mt-4 text-[11px] uppercase text-[color:var(--cream-dim)]">
        Busiest: {peak.label} · {peak.albums.length} records
      </figcaption>
    </figure>
  );
}

/** Cumulative total, the line coloured by year from the records added that year. */
function GrowthChart({ months, yearColour }: { months: MonthStat[]; yearColour: Record<string, string> }) {
  const W = 1000;
  const H = 240;
  let running = 0;
  const points = months.map((m, i) => {
    running += m.albums.length;
    return { x: months.length === 1 ? 0 : (i / (months.length - 1)) * W, total: running, year: m.year };
  });
  const max = Math.max(1, running);
  const y = (v: number) => H - (v / max) * (H - 6) - 3;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const ticks = yearTicks(months);
  const stops = ticks.map(t => ({ offset: t.index / Math.max(1, months.length - 1), colour: yearColour[String(t.year)] ?? NEUTRAL_FLOOD }));

  return (
    <figure className="m-0">
      <div className="flex items-end gap-4">
        <div className="t-mono flex h-[180px] w-10 shrink-0 flex-col justify-between text-right text-[11px] text-[color:var(--cream-dim)] md:h-[240px]" aria-hidden>
          <span>{max.toLocaleString('en-GB')}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-[180px] min-w-0 flex-1 md:h-[240px]"
          role="img"
          aria-label={`Collection size over time, reaching ${max.toLocaleString('en-GB')} records.`}
        >
          <defs>
            <linearGradient id="stats-growth" x1="0" x2="1" y1="0" y2="0">
              {stops.map((s, i) => (
                <stop key={i} offset={s.offset} stopColor={s.colour} />
              ))}
            </linearGradient>
          </defs>
          <path d={area} fill="url(#stats-growth)" opacity={0.22} />
          <path d={line} fill="none" stroke="url(#stats-growth)" strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </div>
      <YearAxis ticks={ticks} total={months.length} />
    </figure>
  );
}

function YearAxis({ ticks, total }: { ticks: Array<{ year: number; index: number }>; total: number }) {
  // Leave room for the value column on the left of each chart.
  return (
    <div className="t-mono relative ml-14 mt-3 h-4 text-[11px] text-[color:var(--cream-dim)]" aria-hidden>
      {ticks.map((t, i) => (
        <span
          key={t.year}
          className={`absolute top-0 ${i % 2 === 1 ? 'hidden sm:inline' : ''}`}
          style={{ left: `${(t.index / Math.max(1, total)) * 100}%` }}
        >
          <span className="hidden md:inline">{t.year}</span>
          <span className="md:hidden">’{String(t.year).slice(2)}</span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------

function paletteFor(colours: ColourMap, uri: string): AlbumColorPalette | null {
  if (!colours) return null;
  return colours[uri] ?? colours[uri.endsWith('/') ? uri : `${uri}/`] ?? null;
}

function byListeners(a: Album, b: Album): number {
  return (b.lastfm_listeners ?? 0) - (a.lastfm_listeners ?? 0);
}

/**
 * A vivid sleeve colour to stand for a group of records: the best-known record
 * in the group whose sleeve has one, preferring colours not yet used so
 * neighbouring bars stay distinct.
 */
function groupColour(albums: Album[], colours: ColourMap, used: Set<string>): string {
  let fallback: string | null = null;
  for (const a of [...albums].sort(byListeners)) {
    const c = vividFrom(paletteFor(colours, a.uri_release));
    if (!c) continue;
    if (!used.has(c)) {
      used.add(c);
      return c;
    }
    fallback ??= c;
  }
  return fallback ?? NEUTRAL_FLOOD;
}

function groupColours(groups: RankedStat[], colours: ColourMap): Record<string, string> {
  const used = new Set<string>();
  return Object.fromEntries(groups.map(g => [g.name, groupColour(g.albums, colours, used)]));
}

function buildPaint(stats: CollectionStats, colours: ColourMap) {
  const album: Record<string, string> = {};
  for (const a of stats.albums) album[a.uri_release] = floodFor(paletteFor(colours, a.uri_release)).flood;

  const used = new Set<string>();
  const latest = stats.recentAdditions[0];
  const headline = [
    latest ? groupColour([latest], colours, used) : NEUTRAL_FLOOD,
    groupColour(stats.topArtists[0]?.albums ?? [], colours, used),
    groupColour(stats.topGenres[0]?.albums ?? [], colours, used),
    groupColour(stats.topArtists[1]?.albums ?? [], colours, used),
  ];

  const years = new Map<string, Album[]>();
  for (const a of stats.albums) {
    const y = String(new Date(a.date_release_year).getFullYear());
    if (!years.has(y)) years.set(y, []);
    years.get(y)!.push(a);
  }

  return {
    album,
    headline,
    decade: groupColours(stats.decadeData, colours),
    genre: groupColours(stats.topGenres, colours),
    country: groupColours(stats.topCountries, colours),
    label: groupColours(stats.topLabels, colours),
    format: groupColours(stats.formatData, colours),
    releaseYear: groupColours(
      stats.topYears.map(y => ({ ...y, albums: years.get(y.name) ?? [] })),
      colours,
    ),
    addedYear: groupColours(stats.addedYears, colours),
    palette: (a: Album) => paletteFor(colours, a.uri_release),
    artistPalette: (artist: ArtistStat) => {
      const pick = [...artist.albums].sort(byListeners).find(a => vividFrom(paletteFor(colours, a.uri_release)));
      return paletteFor(colours, (pick ?? artist.albums[0])?.uri_release ?? '');
    },
  };
}

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

function rank(groups: Map<string, Album[]>, limit?: number): RankedStat[] {
  const out = Array.from(groups.entries())
    .map(([name, albums]) => ({ name, count: albums.length, albums }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return limit ? out.slice(0, limit) : out;
}

function group(data: Album[], keys: (album: Album) => Array<string | null | undefined>): Map<string, Album[]> {
  const map = new Map<string, Album[]>();
  for (const album of data) {
    for (const key of new Set(keys(album))) {
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(album);
    }
  }
  return map;
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function calculateStats(data: Album[]): CollectionStats {
  const cfg = redesignConfig.stats;
  const totalAlbums = data.length;
  const uniqueArtists = new Set(data.map(a => a.release_artist)).size;

  const genreGroups = group(data, a => getCleanGenresFromArray(a.genre_names, a.release_artist));
  const uniqueGenres = genreGroups.size;
  const topGenres = rank(genreGroups, cfg.topGenresCount);

  // Headline artists (exclude "Various")
  const artistGroups = group(data, a => (a.release_artist.toLowerCase() === 'various' ? [] : [a.release_artist]));
  const toArtistStat = (name: string, albums: Album[], uri: string): ArtistStat => ({
    name,
    uri,
    albums,
    albumCount: albums.length,
    image: uri ? getArtistImageFromData(uri, 'medium') : getAlbumImageFromData(albums[0]?.uri_release ?? '', 'medium'),
  });
  const topArtists = rank(artistGroups, cfg.topArtistsCount).map(r => toArtistStat(r.name, r.albums, r.albums[0]?.uri_artist ?? ''));

  let oneHitWonders = 0;
  let catalogArtists = 0;
  artistGroups.forEach(albums => {
    if (albums.length === 1) oneHitWonders++;
    if (albums.length >= 5) catalogArtists++;
  });

  const decadeData = rank(
    group(data, a => {
      const year = new Date(a.date_release_year).getFullYear();
      const decade = Math.floor(year / 10) * 10;
      return decade >= 1960 ? [`${decade}s`] : [];
    }),
  ).sort((a, b) => a.name.localeCompare(b.name));

  // Continuous run of months from the first addition to the latest.
  const byAdded = [...data]
    .filter(a => !Number.isNaN(new Date(a.date_added).getTime()))
    .sort((a, b) => new Date(a.date_added).getTime() - new Date(b.date_added).getTime());
  const months: MonthStat[] = [];
  if (byAdded.length) {
    const monthMap = group(byAdded, a => [monthKey(new Date(a.date_added))]);
    const start = new Date(byAdded[0].date_added);
    const end = new Date(byAdded[byAdded.length - 1].date_added);
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      const key = monthKey(cursor);
      months.push({ key, label: formatMonth(cursor), year: cursor.getFullYear(), albums: monthMap.get(key) ?? [] });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  const addedYears = rank(group(byAdded, a => [String(new Date(a.date_added).getFullYear())]));

  const recentAdditions = [...byAdded].reverse().slice(0, cfg.recentAdditionsCount);
  const randomAlbums = shuffle(data).slice(0, cfg.fromTheCratesCount);

  // Every credited artist (not just headliners) for the random roster.
  const creditGroups = new Map<string, { albums: Album[]; uri: string }>();
  data.forEach(album => {
    album.artists.forEach(artist => {
      if (artist.name.toLowerCase() === 'various') return;
      const entry = creditGroups.get(artist.name);
      if (entry) entry.albums.push(album);
      else creditGroups.set(artist.name, { albums: [album], uri: artist.uri_artist || '' });
    });
  });
  const randomArtists = shuffle(Array.from(creditGroups.entries()))
    .slice(0, cfg.randomArtistsCount)
    .map(([name, { albums, uri }]) => toArtistStat(name, albums, uri));

  const releaseYears = rank(
    group(data, a => {
      const y = new Date(a.date_release_year).getFullYear();
      return Number.isNaN(y) ? [] : [String(y)];
    }),
  );
  const goldenYear = releaseYears[0] ?? null;
  const topYears = releaseYears.slice(0, cfg.topYearsCount);

  const calendarMonths = rank(group(byAdded, a => [new Date(a.date_added).toLocaleString('en-GB', { month: 'long' })]));
  const mostActiveMonth = calendarMonths[0] ? { month: calendarMonths[0].name, count: calendarMonths[0].count } : null;

  const formatData = rank(group(data, a => [a.format_primary || 'Unknown']));
  const labelGroups = group(data, a => a.labels ?? []);
  const topLabels = rank(labelGroups, cfg.topLabelsCount);
  const countryGroups = group(data, a => [a.country]);
  const topCountries = rank(countryGroups, cfg.topCountriesCount);

  const hiddenGems = shuffle(
    data.filter(a => a.lastfm_listeners !== null && a.lastfm_listeners !== undefined && a.lastfm_listeners < cfg.hiddenGemsListenersThreshold),
  ).slice(0, cfg.hiddenGemsCount);

  return {
    albums: data,
    totalAlbums,
    uniqueArtists,
    uniqueGenres,
    uniqueLabels: labelGroups.size,
    uniqueCountries: countryGroups.size,
    avgAlbumsPerArtist: (totalAlbums / Math.max(1, uniqueArtists)).toFixed(1),
    topArtists,
    topGenres,
    decadeData,
    months,
    addedYears,
    firstAdded: byAdded[0] ?? null,
    recentAdditions,
    randomAlbums,
    randomArtists,
    goldenYear,
    topYears,
    oneHitWonders,
    catalogArtists,
    mostActiveMonth,
    formatData,
    topLabels,
    topCountries,
    hiddenGems,
  };
}

function yearTicks(months: MonthStat[]): Array<{ year: number; index: number }> {
  const ticks: Array<{ year: number; index: number }> = [];
  months.forEach((m, index) => {
    if (!ticks.length || ticks[ticks.length - 1].year !== m.year) ticks.push({ year: m.year, index });
  });
  return ticks;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
}
