import { useState, useEffect, useCallback } from 'react';
import { AlbumCard } from '@/components/AlbumCard';
import { ArtistCard } from '@/components/ArtistCard';
import { DossierHero, EditorialSkeleton, PageContainer, SectionHeader } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { getArtistImageFromData, getAlbumImageFromData } from '@/lib/image-utils';
import { appConfig } from '@/config/app.config';
import { redesignConfig } from '@/config/redesign.config';
import { Album } from '@/types/album';

interface ArtistStat {
  name: string;
  uri: string;
  albums: Album[];
  albumCount: number;
  genres: string[];
  image: string;
  latestAlbum: string;
  biography?: string;
}

interface GenreStat { name: string; value: number }
interface DecadeStat { decade: string; count: number }
interface AdditionStat { month: string; count: number }
interface YearStat { year: string; count: number }
interface RankedStat { name: string; count: number }
interface GrowthPoint { month: string; cumulative: number }

interface CollectionStats {
  totalAlbums: number;
  uniqueArtists: number;
  uniqueGenres: number;
  avgAlbumsPerArtist: string;
  topArtists: ArtistStat[];
  topGenres: GenreStat[];
  decadeData: DecadeStat[];
  additionsData: AdditionStat[];
  oldestAlbum: Album | null;
  newestAlbum: Album | null;
  recentAdditions: Album[];
  randomAlbums: Album[];
  randomArtists: ArtistStat[];
  goldenYear: { year: string; count: number } | null;
  topYears: YearStat[];
  oneHitWonders: number;
  catalogArtists: number;
  mostActiveMonth: { month: string; count: number } | null;
  formatData: GenreStat[];
  topLabels: RankedStat[];
  topCountries: RankedStat[];
  growthData: GrowthPoint[];
  hiddenGems: Album[];
}

/**
 * Collection statistics, rebuilt as an editorial dossier:
 * hero kicker → KPI strip → decade bars + genre donut → golden year +
 * top years → top artists → artist depth → recent additions → growth
 * histogram → from-the-crates → random artists. All charts are hand-
 * rolled SVG so the page keeps the paper/ink aesthetic without pulling
 * in Recharts or framer-motion.
 */
export function StatsPage() {
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [loading, setLoading] = useState(true);

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

  const loadCollection = useCallback(async () => {
    try {
      const response = await fetch('/collection.json');
      const data: Album[] = await response.json();
      setStats(calculateStats(data));
    } catch (error) {
      console.error('Error loading collection:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCollection(); }, [loadCollection]);

  if (loading || !stats) {
    return (
      <PageContainer>
        <EditorialSkeleton label="Tallying the collection…" />
      </PageContainer>
    );
  }
  const header = redesignConfig.pageHeaders.stats;

  return (
    <PageContainer>
      {/* Hero -------------------------------------------------------- */}
      <DossierHero
        num={header.num}
        kicker={header.kicker}
        title={header.title}
        subtitle={
          <>
          Everything here derives from <code className="font-mono text-[13px] text-ink">collection.json</code> —
          {` `}{stats.totalAlbums.toLocaleString()} records added over
          {` `}{monthsSince(stats.oldestAlbum?.date_added)} months.
          </>
        }
      />

      {/* KPI strip --------------------------------------------------- */}
      <section className="mb-16">
        <dl className="grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong md:grid-cols-4">
          <KpiTile label="Total albums" value={stats.totalAlbums.toLocaleString()} sub={`${stats.recentAdditions.length} recent`} />
          <KpiTile label="Unique artists" value={stats.uniqueArtists.toLocaleString()} sub={`${stats.oneHitWonders} one-shots`} />
          <KpiTile label="Unique genres" value={String(stats.uniqueGenres)} sub={stats.topGenres[0]?.name || '—'} />
          <KpiTile label="Avg per artist" value={stats.avgAlbumsPerArtist} sub={`${stats.catalogArtists} catalogue`} />
        </dl>
      </section>

      {/* Decades + Genres ------------------------------------------- */}
      <section className="mb-16 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <SectionHeader num="01" label="Albums by decade" />
          <div className="mt-6">
            <DecadeBars data={stats.decadeData.slice(-redesignConfig.stats.decadeBarsMaxDecades)} />
          </div>
        </div>
        <div>
          <SectionHeader num="02" label="Top genres" count={stats.topGenres.length} />
          <div className="mt-6">
            <GenreDonut data={stats.topGenres} />
          </div>
        </div>
      </section>

      {/* Golden year + Top years ------------------------------------ */}
      {stats.goldenYear && (
        <section className="mb-16 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-14">
          <div>
            <SectionHeader num="03" label="Golden year" />
            <div className="mt-6 flex flex-col gap-1 border border-rule-strong bg-paper p-6">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">Most-released year</span>
              <span className="font-grot text-[clamp(64px,10vw,120px)] font-semibold leading-none tracking-[-0.03em] text-ink">
                {stats.goldenYear.year}
              </span>
              <span className="mt-2 font-mono text-[12px] uppercase tracking-[0.08em] text-hl">
                {stats.goldenYear.count} releases
              </span>
            </div>
          </div>
          <div>
            <SectionHeader num="04" label={`Top ${redesignConfig.stats.topYearsCount} years`} />
            <div className="mt-6">
              <TopYearsBars data={stats.topYears} />
            </div>
          </div>
        </section>
      )}

      {/* Top artists ------------------------------------------------ */}
      {stats.topArtists.length > 0 && (
        <section className="mb-16">
          <SectionHeader
            num="05"
            label="Most-held artists"
            count={stats.topArtists.length}
            action="All artists"
            actionTo="/artists/1"
          />
          <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {stats.topArtists.map((a, i) => (
              <ArtistCard key={a.name} artist={a} index={i + 1} />
            ))}
          </div>
        </section>
      )}

      {/* Artist depth ----------------------------------------------- */}
      <section className="mb-16 grid gap-10 lg:grid-cols-3 lg:gap-14">
        <DepthCard num="06" label="One-shots" value={stats.oneHitWonders.toLocaleString()} caption="Artists represented by a single release" />
        <DepthCard num="07" label="Catalogue artists" value={stats.catalogArtists.toLocaleString()} caption="5+ releases in the collection" />
        {stats.mostActiveMonth && (
          <DepthCard num="08" label="Busiest month" value={stats.mostActiveMonth.month} caption={`${stats.mostActiveMonth.count} records added`} />
        )}
      </section>

      {/* Recent additions ------------------------------------------- */}
      <section className="mb-16">
        <SectionHeader
          num="09"
          label="Recent additions"
          count={stats.recentAdditions.length}
          action="Browse catalogue"
          actionTo="/albums/1"
        />
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {stats.recentAdditions.map((a, i) => (
            <AlbumCard key={a.uri_release} album={a} index={i + 1} />
          ))}
        </div>
      </section>

      {/* Additions histogram --------------------------------------- */}
      <section className="mb-16">
        <SectionHeader num="10" label="Additions over time" />
        <div className="mt-6">
          <AdditionsHistogram data={stats.additionsData} />
        </div>
      </section>

      {/* Format breakdown + Country -------------------------------- */}
      <section className="mb-16 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <SectionHeader num="11" label="Formats" count={stats.formatData.length} />
          <div className="mt-6">
            <GenreDonut data={stats.formatData} />
          </div>
        </div>
        <div>
          <SectionHeader num="12" label="Countries of origin" count={stats.topCountries.length} />
          <div className="mt-6">
            <RankedBars data={stats.topCountries} accent="ink" />
          </div>
        </div>
      </section>

      {/* Most-collected labels ------------------------------------- */}
      {stats.topLabels.length > 0 && (
        <section className="mb-16">
          <SectionHeader num="13" label="Most-collected labels" count={stats.topLabels.length} />
          <div className="mt-6">
            <RankedBars data={stats.topLabels} accent="hl" />
          </div>
        </section>
      )}

      {/* Cumulative growth ----------------------------------------- */}
      {stats.growthData.length > 1 && (
        <section className="mb-16">
          <SectionHeader num="14" label="Collection growth · cumulative" />
          <div className="mt-6">
            <GrowthLine data={stats.growthData} />
          </div>
        </section>
      )}

      {/* Hidden gems ----------------------------------------------- */}
      {stats.hiddenGems.length > 0 && (
        <section className="mb-16">
          <SectionHeader
            num="15"
            label="Hidden gems · low Last.fm reach"
            count={stats.hiddenGems.length}
          />
          <p className="mt-3 max-w-prose font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
            Albums in the collection with fewer than {redesignConfig.stats.hiddenGemsListenersThreshold} Last.fm listeners — under-appreciated picks worth a fresh spin.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {stats.hiddenGems.map((a, i) => (
              <AlbumCard key={a.uri_release} album={a} index={i + 1} />
            ))}
          </div>
        </section>
      )}

      {/* From the crates ------------------------------------------- */}
      <section className="mb-16">
        <SectionHeader num="16" label="From the crates · random picks" count={stats.randomAlbums.length} />
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {stats.randomAlbums.map((a, i) => (
            <AlbumCard key={a.uri_release} album={a} index={i + 1} />
          ))}
        </div>
      </section>

      {/* Random roster --------------------------------------------- */}
      <section>
        <SectionHeader num="17" label="Artists you might have forgotten" count={stats.randomArtists.length} />
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {stats.randomArtists.map((a, i) => (
            <ArtistCard key={a.name} artist={a} index={i + 1} />
          ))}
        </div>
      </section>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-paper px-4 py-5">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </dt>
      <dd className="mt-2 font-display text-[clamp(34px,4vw,56px)] uppercase leading-none text-ink">
        {value}
      </dd>
      {sub && (
        <div className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dim">
          {sub}
        </div>
      )}
    </div>
  );
}

function DepthCard({ num, label, value, caption }: { num: string; label: string; value: string; caption: string }) {
  return (
    <div>
      <SectionHeader num={num} label={label} />
      <div className="mt-6 border border-rule-strong bg-paper p-6">
        <div className="font-grot text-[clamp(36px,5vw,52px)] font-semibold leading-none tracking-[-0.02em] text-ink">
          {value}
        </div>
        <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
          {caption}
        </div>
      </div>
    </div>
  );
}

function DecadeBars({ data }: { data: DecadeStat[] }) {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <ul className="flex flex-col gap-2 font-mono">
      {data.map((d) => (
        <li key={d.decade} className="grid grid-cols-[72px_minmax(0,1fr)_64px] items-center gap-4 text-[11px] tracking-[0.04em]">
          <span className="text-ink-3">{d.decade}</span>
          <span className="h-3 bg-paper-2">
            <span className="block h-full bg-ink" style={{ width: `${(d.count / max) * 100}%` }} />
          </span>
          <span className="text-right text-ink-dim">{String(d.count).padStart(4, '0')}</span>
        </li>
      ))}
    </ul>
  );
}

function TopYearsBars({ data }: { data: YearStat[] }) {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <ul className="flex flex-col gap-2 font-mono">
      {data.map((d) => (
        <li key={d.year} className="grid grid-cols-[64px_minmax(0,1fr)_48px] items-center gap-4 text-[11px] tracking-[0.04em]">
          <span className="text-ink-3">{d.year}</span>
          <span className="h-3 bg-paper-2">
            <span className="block h-full bg-hl" style={{ width: `${(d.count / max) * 100}%` }} />
          </span>
          <span className="text-right text-ink-dim">{d.count}</span>
        </li>
      ))}
    </ul>
  );
}

function GenreDonut({ data }: { data: GenreStat[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const size = 220;
  const radius = 90;
  const thickness = 20;
  const cx = size / 2;
  const cy = size / 2;

  // Compute segments as SVG arc paths. A single full-value genre becomes a
  // full ring; otherwise segments are separated by a 1-degree gap.
  let startAngle = -90;
  const segments = data.map((d) => {
    const sweep = (d.value / total) * 360;
    const endAngle = startAngle + sweep;
    const path = describeArc(cx, cy, radius, thickness, startAngle, endAngle);
    const seg = { name: d.name, value: d.value, path, pct: (d.value / total) * 100 };
    startAngle = endAngle;
    return seg;
  });

  // Paper-stroked ink segments at graduated opacity: index 0 darkest,
  // fading to ink-3 ish at the end. Using CSS custom properties so the
  // swatch legend matches.
  const fills = [
    'var(--ink)',
    '#2a2724',
    '#3f3a32',
    '#5a534a',
    '#756a5d',
    '#8a8377',
    '#a19a8d',
    '#b5afa0',
  ];

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-center">
      <svg width={size} height={size} className="shrink-0" aria-hidden>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--rule)" strokeWidth={thickness} />
        {segments.map((s, i) => (
          <path key={s.name} d={s.path} fill={fills[i % fills.length]} />
        ))}
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {segments.map((s, i) => (
          <li key={s.name} className="grid grid-cols-[14px_minmax(0,1fr)_48px_44px] items-center gap-3 font-mono text-[11px] text-ink-2">
            <span className="block h-3 w-3 border border-rule-strong" style={{ background: fills[i % fills.length] }} />
            <span className="truncate font-grot text-[13px] tracking-[-0.005em] text-ink">{s.name}</span>
            <span className="text-right text-ink-dim">{s.pct.toFixed(1)}%</span>
            <span className="text-right tabular-nums text-ink-dim">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RankedBars({ data, accent = 'ink' }: { data: RankedStat[]; accent?: 'ink' | 'hl' }) {
  if (!data.length) return null;
  const max = Math.max(1, ...data.map((d) => d.count));
  const barColor = accent === 'hl' ? 'bg-hl' : 'bg-ink';
  return (
    <ul className="flex flex-col gap-2 font-mono">
      {data.map((d) => (
        <li
          key={d.name}
          className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_48px] items-center gap-4 text-[11px] tracking-[0.04em]"
        >
          <span className="truncate font-grot text-[13px] tracking-[-0.005em] text-ink">{d.name}</span>
          <span className="h-3 bg-paper-2">
            <span className={`block h-full ${barColor}`} style={{ width: `${(d.count / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-ink-dim">{d.count}</span>
        </li>
      ))}
    </ul>
  );
}

function GrowthLine({ data }: { data: GrowthPoint[] }) {
  if (data.length < 2) return null;
  const max = Math.max(1, ...data.map((d) => d.cumulative));
  const width = 960;
  const height = 200;
  const paddingLeft = 40;
  const paddingBottom = 28;
  const plotW = width - paddingLeft - 8;
  const plotH = height - paddingBottom - 8;

  const points = data.map((d, i) => {
    const x = paddingLeft + (i / (data.length - 1)) * plotW;
    const y = plotH - (d.cumulative / max) * plotH + 4;
    return { x, y, ...d };
  });
  const linePath = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${plotH + 4} L ${points[0].x} ${plotH + 4} Z`;

  // Year-boundary ticks: first month of each year gets a label.
  const ticks: { x: number; label: string }[] = [];
  let seenYear = '';
  data.forEach((d, i) => {
    const [, y] = d.month.split('/');
    if (y !== seenYear) {
      seenYear = y;
      ticks.push({ x: paddingLeft + (i / (data.length - 1)) * plotW, label: y });
    }
  });

  // Y-axis grid: 4 evenly-spaced rules.
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: plotH - t * plotH + 4,
    label: Math.round(max * t).toLocaleString(),
  }));

  return (
    <div className="overflow-x-auto border border-rule-strong bg-paper px-4 py-5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full min-w-[640px]"
        preserveAspectRatio="none"
        aria-hidden
      >
        {yTicks.map((t) => (
          <line
            key={t.label}
            x1={paddingLeft}
            y1={t.y}
            x2={width - 8}
            y2={t.y}
            stroke="var(--rule)"
            strokeWidth={0.5}
          />
        ))}
        <path d={areaPath} fill="var(--rule)" opacity={0.35} />
        <path d={linePath} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
        {ticks.map((t) => (
          <text
            key={t.label}
            x={t.x}
            y={height - 8}
            fontSize="10"
            fontFamily="var(--font-mono)"
            fill="var(--ink-dim)"
            letterSpacing="1.2"
          >
            {t.label}
          </text>
        ))}
        {yTicks.map((t) => (
          <text
            key={`y-${t.label}`}
            x={4}
            y={t.y + 3}
            fontSize="10"
            fontFamily="var(--font-mono)"
            fill="var(--ink-dim)"
            letterSpacing="1"
          >
            {t.label}
          </text>
        ))}
      </svg>
      <div className="mt-3 flex items-baseline justify-between font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dim">
        <span>{data[0].month}</span>
        <span>Total: {data[data.length - 1].cumulative.toLocaleString()}</span>
        <span>{data[data.length - 1].month}</span>
      </div>
    </div>
  );
}

function AdditionsHistogram({ data }: { data: AdditionStat[] }) {
  if (!data.length) return null;
  const max = Math.max(1, ...data.map(d => d.count));
  const width = 960;
  const height = 180;
  const paddingLeft = 32;
  const paddingBottom = 24;
  const plotW = width - paddingLeft - 8;
  const plotH = height - paddingBottom - 8;
  const barW = plotW / data.length;

  // Month-boundary ticks: first month of each year gets a mono label.
  const ticks: { x: number; label: string }[] = [];
  let seenYear = '';
  data.forEach((d, i) => {
    const [, y] = d.month.split('/');
    if (y !== seenYear) {
      seenYear = y;
      ticks.push({ x: paddingLeft + i * barW, label: y });
    }
  });

  return (
    <div className="overflow-x-auto border border-rule-strong bg-paper px-4 py-5">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full min-w-[640px]" preserveAspectRatio="none" aria-hidden>
        {data.map((d, i) => {
          const h = (d.count / max) * plotH;
          const x = paddingLeft + i * barW;
          const y = plotH - h + 4;
          return (
            <rect
              key={d.month}
              x={x + 0.5}
              y={y}
              width={Math.max(1, barW - 1)}
              height={h}
              fill="var(--ink)"
            />
          );
        })}
        {ticks.map(t => (
          <text
            key={t.label}
            x={t.x}
            y={height - 6}
            fontSize="10"
            fontFamily="var(--font-mono)"
            fill="var(--ink-dim)"
            letterSpacing="1.2"
          >
            {t.label}
          </text>
        ))}
        {/* Y-axis max label */}
        <text x={4} y={14} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-dim)" letterSpacing="1">
          {max}
        </text>
        <text x={4} y={plotH + 4} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-dim)" letterSpacing="1">
          0
        </text>
      </svg>
      <div className="mt-3 flex items-baseline justify-between font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dim">
        <span>{data[0].month}</span>
        <span>{data.length} months tracked</span>
        <span>{data[data.length - 1].month}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

function calculateStats(data: Album[]): CollectionStats {
  const totalAlbums = data.length;
  const uniqueArtists = new Set(data.map(a => a.release_artist)).size;
  const allFilteredGenres = data.flatMap(a =>
    getCleanGenresFromArray(a.genre_names, a.release_artist)
  );
  const uniqueGenres = new Set(allFilteredGenres).size;

  // Artist counts (exclude "Various")
  const artistCounts = data.reduce<Record<string, number>>((acc, album) => {
    if (album.release_artist.toLowerCase() !== 'various') {
      acc[album.release_artist] = (acc[album.release_artist] || 0) + 1;
    }
    return acc;
  }, {});

  const topArtists: ArtistStat[] = Object.entries(artistCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, redesignConfig.stats.topArtistsCount)
    .map(([name, count]) => {
      const artistAlbums = data.filter(al => al.release_artist === name);
      const first = artistAlbums[0];
      return {
        name,
        uri: first?.uri_artist || '',
        albums: artistAlbums,
        albumCount: count,
        genres: first?.genre_names || [],
        image: getArtistImageFromData(first?.uri_artist || '', 'medium'),
        latestAlbum: first?.release_name || '',
        biography: '',
      };
    });

  const genreCounts = allFilteredGenres.reduce<Record<string, number>>((acc, g) => {
    acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {});
  const topGenres = Object.entries(genreCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, redesignConfig.stats.topGenresCount)
    .map(([name, value]) => ({ name, value }));

  const decadeCounts = data.reduce<Record<string, number>>((acc, album) => {
    const year = new Date(album.date_release_year).getFullYear();
    const decade = Math.floor(year / 10) * 10;
    if (decade >= 1960) {
      acc[`${decade}s`] = (acc[`${decade}s`] || 0) + 1;
    }
    return acc;
  }, {});
  const decadeData = Object.entries(decadeCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([decade, count]) => ({ decade, count }));

  const additionsPerMonth = data.reduce<Record<string, number>>((acc, album) => {
    const d = new Date(album.date_added);
    const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const additionsData = Object.entries(additionsPerMonth)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => {
      const [ma, ya] = a.month.split('/').map(Number);
      const [mb, yb] = b.month.split('/').map(Number);
      return ya - yb || ma - mb;
    });

  const sortedByYear = [...data].sort(
    (a, b) => new Date(a.date_release_year).getTime() - new Date(b.date_release_year).getTime()
  );
  const oldestAlbum = sortedByYear[0] ?? null;
  const newestAlbum = sortedByYear[sortedByYear.length - 1] ?? null;

  const recentAdditions = [...data]
    .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
    .slice(0, redesignConfig.stats.recentAdditionsCount);

  const randomAlbums = [...data]
    .sort(() => 0.5 - Math.random())
    .slice(0, redesignConfig.stats.fromTheCratesCount);

  // Per-artist map from the richer `artists` array
  const allArtistsMap = new Map<string, { albums: Album[]; artist: Album['artists'][number] }>();
  data.forEach(album => {
    album.artists.forEach(artist => {
      if (artist.name.toLowerCase() === 'various') return;
      if (!allArtistsMap.has(artist.name)) {
        allArtistsMap.set(artist.name, { albums: [album], artist });
      } else {
        allArtistsMap.get(artist.name)!.albums.push(album);
      }
    });
  });

  const allArtists: ArtistStat[] = Array.from(allArtistsMap.entries()).map(([name, { albums: artistAlbums, artist }]) => ({
    name,
    uri: artist.uri_artist || '',
    albums: artistAlbums,
    albumCount: artistAlbums.length,
    genres: artistAlbums[0]?.genre_names || [],
    image: artist.uri_artist
      ? getArtistImageFromData(artist.uri_artist, 'medium')
      : getAlbumImageFromData(artistAlbums[0]?.uri_release || '', 'medium'),
    latestAlbum: artistAlbums[0]?.release_name || '',
    biography: '',
  }));

  const randomArtists = [...allArtists]
    .sort(() => 0.5 - Math.random())
    .slice(0, redesignConfig.stats.randomArtistsCount);

  // Year-based metrics
  const yearCounts = data.reduce<Record<string, number>>((acc, album) => {
    const year = new Date(album.date_release_year).getFullYear().toString();
    if (year && year !== 'NaN') {
      acc[year] = (acc[year] || 0) + 1;
    }
    return acc;
  }, {});
  const sortedYears = Object.entries(yearCounts).sort(([, a], [, b]) => b - a);
  const goldenYear = sortedYears[0] ? { year: sortedYears[0][0], count: sortedYears[0][1] } : null;
  const topYears = sortedYears.slice(0, redesignConfig.stats.topYearsCount).map(([year, count]) => ({ year, count }));

  // Depth
  let oneHitWonders = 0;
  let catalogArtists = 0;
  Object.values(artistCounts).forEach(c => {
    if (c === 1) oneHitWonders++;
    if (c >= 5) catalogArtists++;
  });

  // Most active month
  const monthCounts = data.reduce<Record<string, number>>((acc, album) => {
    const month = new Date(album.date_added).toLocaleString('default', { month: 'long' });
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});
  const sortedMonths = Object.entries(monthCounts).sort(([, a], [, b]) => b - a);
  const mostActiveMonth = sortedMonths[0]
    ? { month: sortedMonths[0][0], count: sortedMonths[0][1] }
    : null;

  // Format breakdown — use the canonical bucket from collection.json.
  const formatCounts = data.reduce<Record<string, number>>((acc, album) => {
    const f = album.format_primary || 'Unknown';
    acc[f] = (acc[f] || 0) + 1;
    return acc;
  }, {});
  const formatData: GenreStat[] = Object.entries(formatCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  // Top labels — count each label across all albums; multi-label releases credit each.
  const labelCounts = data.reduce<Record<string, number>>((acc, album) => {
    (album.labels || []).forEach((l) => {
      if (l) acc[l] = (acc[l] || 0) + 1;
    });
    return acc;
  }, {});
  const topLabels: RankedStat[] = Object.entries(labelCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, redesignConfig.stats.topLabelsCount)
    .map(([name, count]) => ({ name, count }));

  // Top countries — sorted by album count, capped at config.
  const countryCounts = data.reduce<Record<string, number>>((acc, album) => {
    if (album.country) acc[album.country] = (acc[album.country] || 0) + 1;
    return acc;
  }, {});
  const topCountries: RankedStat[] = Object.entries(countryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, redesignConfig.stats.topCountriesCount)
    .map(([name, count]) => ({ name, count }));

  // Cumulative growth — running sum over the already-ordered additionsData.
  let running = 0;
  const growthData: GrowthPoint[] = additionsData.map((d) => {
    running += d.count;
    return { month: d.month, cumulative: running };
  });

  // Hidden gems — albums with low or missing Last.fm listener counts.
  const threshold = redesignConfig.stats.hiddenGemsListenersThreshold;
  const hiddenCandidates = data.filter((album) => {
    const l = album.lastfm_listeners;
    return l !== null && l !== undefined && l < threshold;
  });
  const hiddenGems = [...hiddenCandidates]
    .sort(() => 0.5 - Math.random())
    .slice(0, redesignConfig.stats.hiddenGemsCount);

  return {
    totalAlbums,
    uniqueArtists,
    uniqueGenres,
    avgAlbumsPerArtist: (totalAlbums / uniqueArtists).toFixed(1),
    topArtists,
    topGenres,
    decadeData,
    additionsData,
    oldestAlbum,
    newestAlbum,
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
    growthData,
    hiddenGems,
  };
}

function monthsSince(iso?: string): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const now = new Date();
  return Math.max(1, Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30)));
}

// Build an SVG arc path for a donut segment.
function describeArc(cx: number, cy: number, r: number, thickness: number, startAngle: number, endAngle: number): string {
  const startOuter = polarToCartesian(cx, cy, r + thickness / 2, endAngle);
  const endOuter = polarToCartesian(cx, cy, r + thickness / 2, startAngle);
  const startInner = polarToCartesian(cx, cy, r - thickness / 2, endAngle);
  const endInner = polarToCartesian(cx, cy, r - thickness / 2, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M', startOuter.x, startOuter.y,
    'A', r + thickness / 2, r + thickness / 2, 0, largeArc, 0, endOuter.x, endOuter.y,
    'L', endInner.x, endInner.y,
    'A', r - thickness / 2, r - thickness / 2, 0, largeArc, 1, startInner.x, startInner.y,
    'Z',
  ].join(' ');
}

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const a = ((angleInDegrees - 0) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
