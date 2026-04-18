import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Album } from "@/types/album";

interface StatsAsideProps {
  albums: Album[];
}

/**
 * Editorial sidebar: totals, decade histogram, top genres cloud. Reads
 * everything from the already-loaded collection data — no extra fetches.
 */
export function StatsAside({ albums }: StatsAsideProps) {
  const stats = useMemo(() => buildStats(albums), [albums]);
  if (!stats) return null;

  const decadeMax = Math.max(1, ...stats.decades.map((d) => d.n));

  return (
    <aside className="flex flex-col gap-8 font-grot">
      {/* Index block */}
      <Block head="russ.fm / Index">
        <dl className="grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong">
          <KV label="Records" value={stats.totals.albums.toLocaleString()} />
          <KV label="Artists" value={stats.totals.artists.toLocaleString()} />
          <KV label="Genres" value={String(stats.totals.genres)} />
          <KV label="Decades" value={String(stats.decades.length)} />
        </dl>
      </Block>

      {/* Decade histogram */}
      <Block head="Decades">
        <ul className="flex flex-col gap-1.5">
          {stats.decades.map((d) => (
            <li
              key={d.d}
              className="grid grid-cols-[64px_minmax(0,1fr)_48px] items-center gap-3 font-mono text-[11px] tracking-[0.04em]"
            >
              <span className="text-ink-3">{d.d}s</span>
              <span className="h-2.5 bg-paper-2">
                <span
                  className="block h-full bg-ink"
                  style={{ width: `${(d.n / decadeMax) * 100}%` }}
                />
              </span>
              <span className="text-right text-ink-dim">
                {String(d.n).padStart(3, "0")}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      {/* Top genres cloud */}
      <Block head="Top Genres">
        <div className="flex flex-wrap gap-1.5">
          {stats.topGenres.map(({ name, count }) => (
            <Link
              key={name}
              to={`/albums/1?genre=${encodeURIComponent(name)}`}
              className="inline-flex items-baseline gap-1.5 border border-rule-strong bg-paper px-2 py-[3px] text-[11px] text-ink transition-colors hover:bg-paper-2"
            >
              <span className="font-grot tracking-[-0.005em]">{name}</span>
              <span className="font-mono text-[10px] text-ink-dim">
                {count}
              </span>
            </Link>
          ))}
        </div>
      </Block>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function Block({
  head,
  children,
}: {
  head: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 border-b border-rule pb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dim">
        {head}
      </h3>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper px-3 py-2.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">
        {label}
      </dt>
      <dd className="mt-1 font-grot text-[17px] font-bold leading-tight tracking-[-0.015em] text-ink">
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

function buildStats(albums: Album[]) {
  if (!albums.length) return null;

  const artistSet = new Set<string>();
  const genreCounts = new Map<string, number>();
  const decadeCounts = new Map<number, number>();

  for (const a of albums) {
    artistSet.add(a.release_artist);
    for (const g of a.genre_names || []) {
      genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    }
    const year = new Date(a.date_release_year).getFullYear();
    if (Number.isFinite(year)) {
      const decade = Math.floor(year / 10) * 10;
      decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
    }
  }

  const decades = Array.from(decadeCounts.entries())
    .sort(([a], [b]) => a - b)
    .map(([d, n]) => ({ d, n }));

  const topGenres = Array.from(genreCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));

  return {
    totals: {
      albums: albums.length,
      artists: artistSet.size,
      genres: genreCounts.size,
    },
    decades,
    topGenres,
  };
}
