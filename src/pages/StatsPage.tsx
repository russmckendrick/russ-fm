import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RecordTile, SectionHeading, useRecordsFlood } from '@/components/player';
import { IndexRoom } from '@/components/browse/IndexRoom';
import { indexRoomSlots } from '@/lib/indexHeaders';
import { pickHolders } from '@/lib/statsShelf';
import { usePageTitle } from '@/hooks/usePageTitle';
import { GLASS_STRADDLE_INSET } from '@/hooks/useGlassBand';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColorMap, type AlbumColorPalette } from '@/hooks/useAlbumColors';
import { getAlbumImageUrl } from '@/lib/image-utils';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { useCollection } from '@/lib/collection';
import { appConfig } from '@/config/app.config';
import { redesignConfig } from '@/config/redesign.config';
import type { Album } from '@/types/album';
import type { StatsData } from '@/types/stats';

const StatsStory = lazy(() => import('./stats/StatsStory'));

const WRAP = 'mx-auto w-full max-w-[1640px] px-5 md:px-10 lg:px-14';

const TILT = [-2.2, 1.4, -0.8, 2, -1.6, 1];

/**
 * /stats as a place, then the Wrapped story run over every year:
 * - the room: record shelving (IndexRoom 'stats') with six records face out and a
 *   tag pinned under each: six facts drawn at random from the pool in stats.json
 *   (pickHolders), each on a different record, so the shelf changes every visit;
 * - the band: the record count and a few headline figures;
 * - the chapters (stats/StatsStory.tsx) from public/stats/stats.json, counted at
 *   deploy by scripts/generate-stats.ts from every album and artist JSON;
 * - the latest additions, from the collection itself.
 */
export function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { albums: collection } = useCollection();
  const colours = useAlbumColorMap();

  usePageTitle('Collection Statistics | Russ.fm');
  useMetaTags({
    title: 'Collection Statistics | Russ.fm',
    description: data
      ? `${data.totals.records.toLocaleString('en-GB')} records by ${data.totals.artists.toLocaleString('en-GB')} artists: ${data.totals.kg} kg of vinyl and ${data.totals.hours.toLocaleString('en-GB')} hours of music.`
      : 'Explore comprehensive statistics about my vinyl and music collection on Russ.fm',
    image: `${appConfig.siteUrl}/og-image.png`,
    url: `${appConfig.siteUrl}/stats`,
    type: 'website',
  });

  useEffect(() => {
    let alive = true;
    fetch('/stats/stats.json')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<StatsData>;
      })
      .then(d => alive && setData(d))
      .catch(err => {
        console.error('Error loading stats:', err);
        if (alive) setError('The stats could not be loaded.');
      });
    return () => {
      alive = false;
    };
  }, []);

  const recent = useMemo(
    () => [...excludeBoxsetMembers(collection ?? [])].sort((a, b) => b.date_added.localeCompare(a.date_added)).slice(0, redesignConfig.stats.recentAdditionsCount),
    [collection],
  );
  // Six facts from the pool, drawn again on every visit.
  const holders = useMemo(() => (data ? pickHolders(data.holders, indexRoomSlots('stats')) : []), [data]);
  // The band, the see-through header and the page ground take the latest additions' colours.
  const flood = useRecordsFlood(recent.map(a => a.uri_release), undefined, true);
  const palette = (a: Album) => paletteFor(colours, a.uri_release);
  const titles = useMemo(() => new Map(data?.records.map(r => [r.s, r]) ?? []), [data]);

  if (error) {
    return (
      <div className={`${WRAP} py-16`}>
        <h1 className="t-disp m-0 text-[48px] md:text-[80px]">Stats</h1>
        <p className="t-mono mt-6 text-[13px] text-[color:var(--cream-dim)]">{error}</p>
      </div>
    );
  }

  const t = data?.totals;

  return (
    <div className="bg-[var(--ground)] pb-10 text-[color:var(--cream)]">
      <IndexRoom
        room="stats"
        tint={flood?.top ?? 'transparent'}
        bottomInset={GLASS_STRADDLE_INSET}
        className="-mt-16 h-[clamp(420px,120vw,620px)] md:-mt-[84px] md:h-[clamp(560px,86svh,900px)]"
        renderSlot={i => {
          const h = holders[i];
          const r = h && titles.get(h.s);
          return h ? (
            <Link to={`/album/${h.s}/`} className="index-room-sleeve" title={r ? `${r.t} — ${r.by}` : undefined} aria-label={r ? `${r.t} by ${r.by}` : undefined}>
              <img src={getAlbumImageUrl(h.s, 'medium')} alt="" decoding="async" />
            </Link>
          ) : null;
        }}
        renderOver={i => {
          const h = holders[i];
          if (!h) return null;
          return (
            <Link to={`/album/${h.s}/`} className="stats-tag" style={{ rotate: `${TILT[i % TILT.length]}deg` }} tabIndex={-1} aria-hidden>
              <b>{h.stat}</b>
              <small>{h.label}</small>
              <em>
                {h.note}
                <br />
                {titles.get(h.s)?.t}
              </em>
            </Link>
          );
        }}
      />
      <section className="glass-band glass-band-straddle" style={{ '--band-tint': flood?.top ?? 'transparent' } as CSSProperties}>
        <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-4 px-5 pb-6 md:min-h-[104px] md:flex-row md:items-center md:gap-10 md:px-10 md:pb-5 lg:px-14">
          <h1 className="t-disp m-0 whitespace-nowrap text-[36px] leading-[0.9] sm:text-[44px] md:text-[64px] lg:text-[84px]">Stats</h1>
          {t && (
            <dl className="m-0 grid min-w-0 grid-cols-3 gap-x-6 gap-y-3 sm:grid-cols-5 md:ml-auto md:flex md:gap-9 md:overflow-hidden">
              {[
                ['Records', t.records.toLocaleString('en-GB')],
                ['Since', new Date(`${t.since}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })],
                ['Artists', t.artists.toLocaleString('en-GB')],
                ['Discs', t.discs.toLocaleString('en-GB')],
                ['Shelf', `${t.metres} m`],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="glass-sub t-kicker text-[10px]">{k}</dt>
                  <dd className="m-0 mt-1.5 truncate text-[16px] font-bold">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {data ? (
        <Suspense fallback={<StorySkeleton />}>
          <StatsStory data={data} />
        </Suspense>
      ) : (
        <StorySkeleton />
      )}

      {recent.length > 0 && (
        <Section>
          <SectionHeading title="Latest additions" link={{ to: '/albums/1', label: 'All albums' }} />
          <div className="shelf-scroll -mx-5 mt-8 gap-5 px-5 pb-6 md:-mx-10 md:px-10 lg:-mx-14 lg:px-14">
            {recent.map(a => (
              <RecordTile key={a.uri_release} album={a} palette={palette(a)} meta={formatDay(a.date_added)} className="w-[150px] shrink-0 md:w-[200px]" />
            ))}
          </div>
        </Section>
      )}

    </div>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <section className={`${WRAP} pt-16 md:pt-24`}>{children}</section>;
}

function StorySkeleton() {
  return (
    <div className={`${WRAP} py-16 md:py-28`} aria-busy="true" aria-label="Loading stats">
      <div className="h-[clamp(80px,10vw,140px)] w-2/3 animate-pulse rounded-2xl bg-[var(--ground-2)] motion-reduce:animate-none" />
      <div className="mt-12 h-[360px] animate-pulse rounded-2xl bg-[var(--ground-2)] motion-reduce:animate-none" />
    </div>
  );
}

function paletteFor(colours: Record<string, AlbumColorPalette> | null, uri: string): AlbumColorPalette | null {
  if (!colours) return null;
  return colours[uri] ?? colours[uri.endsWith('/') ? uri : `${uri}/`] ?? null;
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
}
