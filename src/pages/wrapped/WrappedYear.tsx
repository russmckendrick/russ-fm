import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { Presentation, Grid3X3 } from 'lucide-react';
import { AlbumCard } from '@/components/AlbumCard';
import { PageContainer, SectionHeader, DragWall } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { GenreTag } from '@/components/ui/genre-tag';
import { handleImageError } from '@/lib/image-utils';
import { WrappedData, WrappedRelease } from '@/types/wrapped';
import type { Album } from '@/types/album';
import { YearSelector } from './components/YearSelector';
import { WrappedPresentation } from './WrappedPresentation';

type ViewMode = 'grid' | 'presentation';

/**
 * Editorial year dossier for `/wrapped/:year`. Opens in a grid view by
 * default — kicker + giant `YYYY` word treatment, KPI strip, album-of-
 * the-year, top-10 list with count-weighted bars, top artists grid,
 * genres + decades breakdowns, monthly histogram, and year pagination.
 * The full-screen `WrappedPresentation` flow still lives one button-
 * click away and is unchanged by this redesign.
 */
export function WrappedYear() {
  const { year } = useParams<{ year: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const yearNum = year ? parseInt(year, 10) : null;
  const currentYear = new Date().getFullYear();

  usePageTitle(data ? `${yearNum} Wrapped` : 'Wrapped');

  // Discover which years have at least one release (used by the selector
  // and prev/next pager).
  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/collection.json');
        const collection = await response.json();
        const years = new Set<number>();
        collection.forEach((release: { date_added: string }) => {
          const y = new Date(release.date_added).getFullYear();
          years.add(y);
        });
        setAvailableYears(Array.from(years).sort((a, b) => b - a));
      } catch (err) {
        console.error('Failed to load available years:', err);
      }
    })();
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

  if (!year || !yearNum || Number.isNaN(yearNum)) {
    return <Navigate to={`/wrapped/${currentYear - 1}`} replace />;
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="py-16 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          Loading {yearNum} Wrapped…
        </div>
      </PageContainer>
    );
  }

  if (error || !data) {
    return (
      <PageContainer>
        <div className="py-16">
          <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim hover:text-ink">
            ← Home
          </Link>
          <div className="mt-8 border border-rule-strong bg-paper-2/40 px-6 py-16 text-center font-grot">
            <p className="text-[17px] font-semibold text-ink">Couldn't load Wrapped</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
              {error || 'Failed to load wrapped data'}
            </p>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (viewMode === 'presentation') {
    return (
      <div key={yearNum} className="relative">
        <div className="fixed right-4 top-4 z-[60] flex items-center gap-2">
          <YearSelector
            currentYear={yearNum}
            availableYears={availableYears}
            onYearChange={(y) => navigate(`/wrapped/${y}`)}
          />
          <button
            onClick={() => setViewMode('grid')}
            className="flex items-center gap-2 border border-white/20 bg-white/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-white backdrop-blur-md transition-colors hover:bg-white/20"
            aria-label="Switch to grid view"
          >
            <Grid3X3 className="h-4 w-4" />
            <span className="hidden sm:inline">Dossier</span>
          </button>
        </div>
        <WrappedPresentation
          data={data}
          availableYears={availableYears}
          previousYear={previousYear}
          nextYear={nextYear}
        />
      </div>
    );
  }

  // ---------- Editorial grid/dossier view ----------
  const { summary, insights } = data;
  const albumOfYear = insights.topAlbums[0];

  const topArtists = insights.topArtists.slice(0, 8);
  const topAlbumsList = insights.topAlbums.slice(0, 10);
  const maxTopAlbumCount = Math.max(1, ...insights.topArtists.map(a => a.count));

  return (
    <PageContainer>
      <header className="mb-14 border-b border-rule pb-10">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
            <span className="text-hl">WRAPPED</span>
            <span>·</span>
            <span>RUSS.FM / YEAR DOSSIER</span>
            {data.isYearToDate && (
              <>
                <span>·</span>
                <span className="text-hl">YEAR TO DATE</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('presentation')}
              className="inline-flex items-center gap-2 border border-rule-strong bg-paper px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink transition-colors hover:bg-paper-2"
              aria-label="Switch to presentation view"
            >
              <Presentation className="h-4 w-4" />
              <span className="hidden sm:inline">Presentation</span>
            </button>
            <YearSelector
              currentYear={yearNum}
              availableYears={availableYears}
              onYearChange={(y) => navigate(`/wrapped/${y}`)}
            />
          </div>
        </div>

        <h1 className="font-grot text-[clamp(72px,16vw,220px)] font-semibold leading-[0.88] tracking-[-0.04em] text-ink">
          {yearNum}
        </h1>
        <p className="mt-5 max-w-[60ch] font-grot text-[17px] leading-[1.7] text-ink-2">
          {data.isYearToDate
            ? `So far this year — ${summary.totalReleases.toLocaleString()} records added, averaging ${summary.avgPerMonth.toFixed(1)} a month. On pace for ${summary.projectedTotal ?? '—'} by year end.`
            : `${summary.totalReleases.toLocaleString()} records added during ${yearNum}, averaging ${summary.avgPerMonth.toFixed(1)} a month. ${summary.peakMonth} was the loudest month.`}
        </p>
      </header>

      {/* KPI strip -------------------------------------------------- */}
      <section className="mb-16">
        <dl className="grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong md:grid-cols-4">
          <KpiTile label="Records" value={summary.totalReleases.toLocaleString()} sub={data.isYearToDate && summary.projectedTotal ? `~${summary.projectedTotal} projected` : ''} />
          <KpiTile label="Artists" value={summary.uniqueArtists.toLocaleString()} sub={`${(summary.totalReleases / Math.max(1, summary.uniqueArtists)).toFixed(1)} avg / artist`} />
          <KpiTile label="Avg / month" value={summary.avgPerMonth.toFixed(1)} sub={`Peak · ${summary.peakMonth}`} />
          <KpiTile label="Top genre" value={summary.topGenre || '—'} sub={summary.topStyle ? `Style · ${summary.topStyle}` : ''} />
        </dl>
      </section>

      {/* Album of the year ----------------------------------------- */}
      {albumOfYear && (
        <section className="mb-16">
          <SectionHeader num="01" label={data.isYearToDate ? 'Most recent addition' : 'Album of the year'} />
          <div className="mt-6 grid gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
            <Link
              to={`/album/${albumOfYear.slug}`}
              className="mx-auto block w-full max-w-sm shrink-0 md:mx-0 md:w-80"
            >
              <div className="aspect-square w-full overflow-hidden border border-rule-strong bg-paper-2 shadow-[0_30px_60px_-20px_rgba(14,13,11,0.25)]">
                <img
                  src={albumOfYear.images['hi-res'] || albumOfYear.images.medium}
                  alt={albumOfYear.title}
                  onError={handleImageError}
                  className="h-full w-full object-cover"
                />
              </div>
            </Link>

            <div className="flex min-w-0 flex-col gap-5">
              <div>
                <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-hl">
                  {new Date(albumOfYear.date_added).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                </div>
                <h3 className="font-grot text-[clamp(32px,4.5vw,52px)] font-semibold leading-[0.98] tracking-[-0.02em] text-ink">
                  <Link to={`/album/${albumOfYear.slug}`} className="transition-colors hover:text-hl">
                    {albumOfYear.title}
                  </Link>
                </h3>
                <div className="mt-2 font-grot text-[18px] text-ink-2">{albumOfYear.artist_name}</div>
              </div>
              <p className="max-w-[62ch] font-grot text-[16px] leading-[1.7] text-ink-2">
                The first record to land in the crate this year. {summary.totalReleases.toLocaleString()} more followed —
                spread across {summary.uniqueArtists.toLocaleString()} artists, with {summary.topGenre.toLowerCase()} running
                as the house style.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Top 10 albums --------------------------------------------- */}
      {topAlbumsList.length > 0 && (
        <section className="mb-16">
          <SectionHeader num="02" label="Top 10 · Most-played imagery" count={topAlbumsList.length} />
          <ul className="mt-6 divide-y divide-rule border-y border-rule">
            {topAlbumsList.map((album, i) => (
              <li key={album.slug} className="grid grid-cols-[40px_56px_minmax(0,1fr)_auto] items-center gap-4 py-3">
                <span className="font-mono text-[11px] tracking-[0.04em] text-ink-dim tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <Link to={`/album/${album.slug}`} className="block">
                  <img
                    src={album.images.medium}
                    alt=""
                    loading="lazy"
                    onError={handleImageError}
                    className="h-12 w-12 border border-rule-strong object-cover"
                  />
                </Link>
                <div className="min-w-0">
                  <Link
                    to={`/album/${album.slug}`}
                    className="block truncate font-grot text-[15px] font-semibold text-ink transition-colors hover:text-hl"
                  >
                    {album.title}
                  </Link>
                  <div className="truncate font-mono text-[11px] uppercase tracking-[0.04em] text-ink-dim">
                    {album.artist_name}
                  </div>
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
                  {new Date(album.date_added).toLocaleString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Top artists grid ------------------------------------------ */}
      {topArtists.length > 0 && (
        <section className="mb-16">
          <SectionHeader num="03" label="New rotation · Top artists" count={topArtists.length} />
          <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {topArtists.map((artist, i) => {
              const img = artist.images?.['hi-res'] || artist.images?.medium || artist.images?.avatar;
              const pct = (artist.count / maxTopAlbumCount) * 100;
              return (
                <li key={artist.slug}>
                  <Link to={`/artist/${artist.slug}`} className="group block">
                    <div className="relative aspect-square w-full overflow-hidden rounded-full border border-rule-strong bg-paper-2">
                      {img ? (
                        <img
                          src={img}
                          alt={artist.name}
                          loading="lazy"
                          onError={handleImageError}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-mono text-[14px] text-ink-dim">
                          {artist.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-dim">
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      <span>·</span>
                      <span>{artist.count} REL</span>
                    </div>
                    <div className="mt-0.5 truncate font-grot text-[15px] font-semibold leading-tight tracking-[-0.005em] text-ink transition-colors group-hover:text-hl">
                      {artist.name}
                    </div>
                    <div className="mt-1.5 h-1 w-full bg-paper-2">
                      <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Genres + Decades ------------------------------------------ */}
      <section className="mb-16 grid gap-10 lg:grid-cols-2 lg:gap-14">
        {insights.genres.length > 0 && (
          <div>
            <SectionHeader num="04" label="Genres in rotation" count={insights.genres.length} />
            <ul className="mt-6 flex flex-col gap-2 font-mono">
              {insights.genres.slice(0, 8).map((g) => {
                const max = insights.genres[0]?.count || 1;
                return (
                  <li
                    key={g.name}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_48px_48px] items-center gap-4 text-[11px] tracking-[0.04em]"
                  >
                    <GenreTag genre={g.name} size="sm" linkable />
                    <span className="h-2.5 bg-paper-2">
                      <span className="block h-full bg-ink" style={{ width: `${(g.count / max) * 100}%` }} />
                    </span>
                    <span className="text-right text-ink-dim tabular-nums">{g.count}</span>
                    <span className="text-right text-ink-dim tabular-nums">{g.percentage.toFixed(0)}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {insights.decades.length > 0 && (
          <div>
            <SectionHeader num="05" label="Decade spread" count={insights.decades.length} />
            <ul className="mt-6 flex flex-col gap-2 font-mono">
              {insights.decades.map((d) => {
                const max = Math.max(1, ...insights.decades.map(x => x.count));
                return (
                  <li key={d.name} className="grid grid-cols-[72px_minmax(0,1fr)_48px] items-center gap-4 text-[11px] tracking-[0.04em]">
                    <span className="text-ink-3">{d.name}</span>
                    <span className="h-2.5 bg-paper-2">
                      <span className="block h-full bg-hl" style={{ width: `${(d.count / max) * 100}%` }} />
                    </span>
                    <span className="text-right text-ink-dim tabular-nums">{d.count}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* Monthly journey ------------------------------------------- */}
      {insights.timeline.length > 0 && (
        <section className="mb-16">
          <SectionHeader num="06" label="Monthly journey" />
          <MonthlySummary months={insights.timeline} />
          <div className="mt-10 flex flex-col gap-12">
            {insights.timeline
              .filter(m => m.releases.length > 0)
              .map((m) => (
                <MonthWall key={m.month} month={m.month} releases={m.releases} />
              ))}
          </div>
        </section>
      )}

      {/* Pagination ------------------------------------------------ */}
      <nav className="flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6 font-mono text-[11px] uppercase tracking-[0.08em]">
        <div>
          {previousYear ? (
            <Link
              to={`/wrapped/${previousYear}`}
              className="inline-flex items-center gap-2 text-ink-dim transition-colors hover:text-ink"
            >
              ← {previousYear}
            </Link>
          ) : (
            <span className="text-ink-dim/40">— —</span>
          )}
        </div>
        <Link to="/" className="text-ink-dim transition-colors hover:text-ink">
          Home
        </Link>
        <div>
          {nextYear ? (
            <Link
              to={`/wrapped/${nextYear}`}
              className="inline-flex items-center gap-2 text-ink-dim transition-colors hover:text-ink"
            >
              {nextYear} →
            </Link>
          ) : (
            <span className="text-ink-dim/40">— —</span>
          )}
        </div>
      </nav>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-paper px-4 py-5">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </dt>
      <dd className="mt-2 font-grot text-[clamp(22px,3vw,32px)] font-semibold leading-tight tracking-[-0.02em] text-ink">
        {value}
      </dd>
      {sub && (
        <div className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dim">
          {sub}
        </div>
      )}
    </div>
  );
}

function MonthlySummary({
  months,
}: {
  months: Array<{ month: string; count: number }>;
}) {
  const max = Math.max(1, ...months.map(m => m.count));
  return (
    <div className="mt-6 border border-rule-strong bg-paper p-5">
      <ol className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12">
        {months.map((m) => {
          const h = Math.max(6, (m.count / max) * 88);
          const isPeak = m.count === max;
          return (
            <li key={m.month} className="flex flex-col items-start gap-2">
              <div className="flex h-24 w-full items-end">
                <span
                  className={`block w-full ${isPeak ? 'bg-hl' : 'bg-ink'}`}
                  style={{ height: `${h}px` }}
                  aria-hidden
                />
              </div>
              <div className="flex w-full items-baseline justify-between font-mono text-[10.5px] tracking-[0.04em]">
                <span className="uppercase text-ink-dim">{m.month.slice(0, 3)}</span>
                <span className="tabular-nums text-ink">{m.count}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MonthWall({
  month,
  releases,
}: {
  month: string;
  releases: WrappedRelease[];
}) {
  const albums = useMemo(() => releases.map(wrappedReleaseToAlbum), [releases]);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
        <h3 className="font-grot text-[clamp(18px,1.6vw,22px)] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {month}
        </h3>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
          {String(albums.length).padStart(3, '0')} RECORD{albums.length === 1 ? '' : 'S'}
        </span>
      </div>
      <DragWall
        ariaLabel={`${month} releases`}
        itemBasis="min(42vw, 200px)"
      >
        {albums.map((a, i) => (
          <AlbumCard key={a.uri_release} album={a} index={i + 1} />
        ))}
      </DragWall>
    </div>
  );
}

/**
 * Shape-shift a Wrapped JSON release into the `Album` contract
 * `AlbumCard` expects (the two JSON shapes come from different
 * pipelines but carry the same raw fields). Missing links are
 * derived from the slug.
 */
function wrappedReleaseToAlbum(r: WrappedRelease): Album {
  const uriRelease = `/album/${r.slug}/`;
  const primaryArtistSlug = r.artists[0]?.slug;
  const uriArtist = primaryArtistSlug ? `/artist/${primaryArtistSlug}/` : '';
  return {
    release_name: r.release_name,
    release_artist: r.release_artist,
    date_added: r.date_added,
    date_release_year: r.date_release_year,
    genre_names: r.genre_names,
    uri_release: uriRelease,
    uri_artist: uriArtist,
    images_uri_release: {
      'hi-res': r.images['hi-res'] || r.images.medium,
      medium: r.images.medium,
    },
    artists: r.artists.map((a) => ({
      name: a.name,
      uri_artist: `/artist/${a.slug}/`,
      images_uri_artist: {
        'hi-res': a.images?.['hi-res'] || a.images?.medium || '',
        medium: a.images?.medium || '',
        avatar: a.images?.avatar || '',
      },
    })),
  };
}
