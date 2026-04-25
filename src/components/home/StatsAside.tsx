import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { appConfig } from "@/config/app.config";
import type { Album } from "@/types/album";

interface StatsAsideProps {
  albums: Album[];
}

const OVERVIEW_GENRES = [
  "Rock",
  "Alternative",
  "Electronic",
  "Ambient",
  "Jazz",
  "Hip Hop",
  "Experimental",
  "Folk",
];

/**
 * Editorial sidebar: collection overview, decade mix, genre bars, and
 * addition timeline. Reads everything from the already-loaded collection
 * data, keeping the home page tied to static JSON rather than a live API.
 */
export function StatsAside({ albums }: StatsAsideProps) {
  const stats = useMemo(() => buildStats(albums), [albums]);
  if (!stats) return null;

  const decadeMax = Math.max(1, ...stats.topDecades.map((d) => d.count));
  const genreMax = Math.max(1, ...stats.topGenres.map((g) => g.count));

  return (
    <aside className="flex flex-col gap-5 bg-stage px-4 py-5 font-grot text-stage-ink md:px-5 md:py-6">
      <Block head="Collection Overview" prominent>
        <dl className="grid grid-cols-2 border border-stage-rule">
          <KV label="Records" value={stats.totals.records.toLocaleString()} />
          <KV label="Artists" value={stats.totals.artists.toLocaleString()} />
          <KV label="Genres" value={String(stats.totals.genres)} />
          <KV label="Decades" value={String(stats.totals.decades)} />
        </dl>
      </Block>

      <Block head="Top Decades">
        <ul className="flex flex-col gap-2">
          {stats.topDecades.map((d) => (
            <li
              key={d.decade}
              className="grid grid-cols-[52px_minmax(0,1fr)_30px] items-center gap-3 font-mono text-[10px]"
            >
              <span className="text-stage-dim">{d.decade}s</span>
              <span
                className="h-1.5 overflow-hidden bg-stage-3"
                aria-label={`${d.decade}s, ${d.percentage}%`}
              >
                <span
                  className="block h-full bg-gradient-to-r from-stage-ink via-stage-ink to-stage-ink/25"
                  style={{ width: `${(d.count / decadeMax) * 100}%` }}
                />
              </span>
              <span className="text-right text-stage-dim">{d.percentage}%</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block head="Top Genres">
        <ul className="flex flex-col gap-2">
          {stats.topGenres.map(({ name, count }) => (
            <li
              key={name}
              className="grid grid-cols-[minmax(80px,0.76fr)_minmax(0,1fr)] items-center gap-3 font-mono text-[10px]"
            >
              <Link
                to={`/albums/1?genre=${encodeURIComponent(name)}`}
                className="truncate text-stage-dim transition-colors hover:text-stage-ink"
              >
                {name}
              </Link>
              <span
                className="h-1.5 overflow-hidden bg-stage-3"
                aria-label={`${name}, ${count.toLocaleString()} records`}
              >
                <span
                  className="block h-full bg-gradient-to-r from-stage-ink via-stage-ink/80 to-stage-ink/15"
                  style={{ width: `${(count / genreMax) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block head="Collection Timeline">
        <TimelineChart points={stats.timeline} />
        <p className="mt-3 font-grot text-[12px] font-semibold leading-tight text-stage-dim">
          Additions over time.
        </p>
      </Block>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function Block({
  head,
  prominent = false,
  children,
}: {
  head: string;
  prominent?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <h3
        className={
          prominent
            ? "mb-4 font-mono text-[13px] uppercase leading-tight text-stage-ink"
            : "mb-3 border-t border-stage-rule pt-4 font-mono text-[11px] uppercase leading-tight text-stage-ink"
        }
      >
        {head}
      </h3>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col border-b border-r border-stage-rule px-3 py-3.5 even:border-r-0 [&:nth-last-child(-n+2)]:border-b-0">
      <dt className="order-2 mt-2 font-mono text-[9.5px] uppercase leading-tight text-stage-dim">
        {label}
      </dt>
      <dd className="order-1 font-grot text-[clamp(24px,2.6vw,32px)] font-semibold leading-none text-stage-ink">
        {value}
      </dd>
    </div>
  );
}

function TimelineChart({
  points,
}: {
  points: Array<{ year: number; count: number }>;
}) {
  if (!points.length) return null;

  const width = 300;
  const height = 86;
  const padX = 8;
  const padY = 8;
  const values = points.map((p) => p.count);
  const min = 0;
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const xFor = (index: number) =>
    padX + (points.length === 1 ? 0 : (index / (points.length - 1)) * plotW);
  const yFor = (count: number) =>
    padY + plotH - ((count - min) / range) * plotH;
  const path = points
    .map((p, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(2)} ${yFor(p.count).toFixed(2)}`)
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${path} L ${xFor(points.length - 1).toFixed(2)} ${height - padY} L ${padX} ${height - padY} Z`;
  const ticks = points.filter((p, index) =>
    index === 0 || index === points.length - 1 || p.year % 2 === 0
  );

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full overflow-visible"
        role="img"
        aria-label={`Yearly additions from ${first.year} to ${last.year}`}
        preserveAspectRatio="none"
      >
        {ticks.map((tick) => {
          const index = points.findIndex((p) => p.year === tick.year);
          const x = xFor(index);
          return (
            <line
              key={tick.year}
              x1={x}
              x2={x}
              y1={padY}
              y2={height - padY}
              stroke="var(--stage-rule)"
              strokeWidth="1"
            />
          );
        })}
        <path d={areaPath} fill="var(--stage-3)" opacity="0.7" />
        <path
          d={path}
          fill="none"
          stroke="var(--stage-ink)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
        {points.map((p, index) => (
          <circle
            key={p.year}
            cx={xFor(index)}
            cy={yFor(p.count)}
            r={index === points.length - 1 ? 3 : 0}
            fill="var(--stage-ink)"
          />
        ))}
      </svg>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-stage-dim">
        {ticks.map((tick) => (
          <span key={tick.year}>{tick.year}</span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function buildStats(albums: Album[]) {
  if (!albums.length) return null;

  const excludedDecades = new Set(appConfig.homepage.eras.excludedDecades);
  const visibleAlbums = albums.filter((album) => {
    const decade = getReleaseDecade(album);
    return decade === null || !excludedDecades.has(decade);
  });
  const artistSet = new Set<string>();
  const genreCounts = new Map<string, number>();
  const decadeCounts = new Map<number, number>();
  const allDecades = new Set<number>();

  for (const a of albums) {
    const decade = getReleaseDecade(a);
    if (decade !== null) allDecades.add(decade);
  }

  for (const a of visibleAlbums) {
    artistSet.add(a.release_artist);
    for (const g of a.genre_names || []) {
      genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    }
    const decade = getReleaseDecade(a);
    if (decade !== null) {
      decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
    }
  }

  const topDecades = Array.from(decadeCounts.entries())
    .filter(([d]) => d >= 1960)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 7)
    .map(([decade, count]) => ({
      decade,
      count,
      percentage: Math.round((count / Math.max(1, visibleAlbums.length)) * 100),
    }));

  const usedGenres = new Set<string>();
  const featuredGenres = OVERVIEW_GENRES
    .map((name) => ({ name, count: genreCounts.get(name) ?? 0 }))
    .filter((genre) => genre.count > 0);
  featuredGenres.forEach((genre) => usedGenres.add(genre.name));
  const fallbackGenres = Array.from(genreCounts.entries())
    .filter(([name]) => !usedGenres.has(name))
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }));
  const topGenres = [...featuredGenres, ...fallbackGenres].slice(0, 8);

  return {
    totals: {
      records: visibleAlbums.length,
      artists: artistSet.size,
      genres: genreCounts.size,
      decades: allDecades.size,
    },
    topDecades,
    topGenres,
    timeline: buildTimeline(visibleAlbums),
  };
}

function getReleaseDecade(album: Album): number | null {
  const year = new Date(album.date_release_year).getFullYear();
  if (!Number.isFinite(year)) return null;
  return Math.floor(year / 10) * 10;
}

function buildTimeline(albums: Album[]) {
  const yearly = new Map<number, number>();
  for (const album of albums) {
    const year = new Date(album.date_added).getFullYear();
    if (!Number.isFinite(year)) continue;
    yearly.set(year, (yearly.get(year) ?? 0) + 1);
  }

  const years = Array.from(yearly.keys()).sort((a, b) => a - b);
  if (!years.length) return [];

  const startYear = Math.max(2016, years[0]);
  const endYear = Math.max(new Date().getFullYear(), years[years.length - 1]);
  const points: Array<{ year: number; count: number }> = [];
  for (let year = startYear; year <= endYear; year++) {
    points.push({ year, count: yearly.get(year) ?? 0 });
  }
  return points;
}
