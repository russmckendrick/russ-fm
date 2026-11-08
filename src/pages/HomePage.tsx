import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { appConfig } from '@/config/app.config';
import { loadDetailJson, useCollection } from '@/lib/collection';
import { discLooks } from '@/lib/vinylLook';
import { useAlbumColorMap, type AlbumColorPalette } from '@/hooks/useAlbumColors';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { buildFacetValues, FACETS } from '@/lib/browseFacets';
import { getAlbumImageFromData, getAlbumImageUrl, getArtistImageFromData } from '@/lib/image-utils';
import { pickHolders } from '@/lib/statsShelf';
import { ArtistCard } from '@/components/ArtistCard';
import { BOLD_VIVID, floodFor, inkOn, type Flood } from '@/lib/sleeveColour';
import { originalYear } from '@/lib/releaseYear';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';
import type { StatsHolder } from '@/types/stats';
import {
  AFTER_HERO,
  FitTitle,
  RecordTile,
  SectionHeading,
  Sticker,
  usePageFlood,
} from '@/components/player';
import { ReleaseRoom, type RoomRecord } from '@/components/album/ReleaseRoom';
import { releaseRoomFor } from '@/lib/releaseRooms';

interface FeaturedDetail {
  tracks: number;
  sides: number;
  label?: string;
}

/** The fields the hero reads from a release's detail JSON. */
interface HeroDetailJson {
  tracklist?: Array<{ position?: string }>;
  labels?: string[];
}

const HERO_COUNT = appConfig.homepage.hero.numberOfFeaturedAlbums;
const HERO_MS = appConfig.homepage.hero.autoRotateInterval;

export function HomePage() {
  usePageTitle('russ.fm — record collection');
  const { albums: collection } = useCollection();
  const colours = useAlbumColorMap();
  const albums = useMemo(() => excludeBoxsetMembers(collection), [collection]);

  const recent = useMemo(
    () => [...albums].sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime()),
    [albums],
  );
  const featured = recent.slice(0, HERO_COUNT);

  return (
    <>
      <Hero featured={featured} colours={colours} />
      <div className={cn('mx-auto flex w-full max-w-[1640px] flex-col gap-20 px-5 pb-10 md:px-10 lg:gap-24 lg:px-14', AFTER_HERO, 'pt-16')}>
        <LatestAdditions recent={recent} colours={colours} />
        <MostCollected albums={albums} colours={colours} />
        <Genres albums={albums} colours={colours} />
        <Facts />
        <RandomPicks albums={albums} colours={colours} />
        <BrowseByColour albums={albums} colours={colours} />
      </div>
    </>
  );
}

/* --------------------------------------------------------------- Hero -- */

function Hero({ featured, colours }: { featured: Album[]; colours: Record<string, AlbumColorPalette> | null }) {
  const [index, setIndex] = useState(0);
  const [details, setDetails] = useState<Record<string, FeaturedDetail>>({});
  const reduced = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    featured.forEach(album => {
      if (!album.json_detailed_release || details[album.uri_release]) return;
      // Shared cache: opening the album from the hero reuses this response.
      loadDetailJson<HeroDetailJson>(album.json_detailed_release)
        .then(d => {
          if (!d) return;
          const positions: string[] = (d.tracklist ?? []).map((t: { position?: string }) => t.position ?? '').filter(Boolean);
          const sides = new Set(positions.map(p => p[0]).filter(c => /[A-Z]/i.test(c))).size;
          setDetails(prev => ({
            ...prev,
            [album.uri_release]: {
              tracks: positions.length,
              sides,
              label: d.labels?.[0],
            },
          }));
        })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featured.map(a => a.uri_release).join('|')]);

  const count = featured.length;
  const go = useCallback((i: number) => {
    if (!count) return;
    setIndex(((i % count) + count) % count);
  }, [count]);

  const floods: Flood[] = featured.map(a => floodFor(colours?.[a.uri_release]));
  const current = featured[index];
  const flood = floods[index] ?? floodFor(null);
  usePageFlood(
    current ? flood.flood : null,
    current ? flood.ink : null,
    current ? { cover: getAlbumImageFromData(current.uri_release, 'hi-res'), ground: flood.ground, vinyl: current.vinyl_colours?.[0], room: true } : undefined,
  );
  // Every featured record in its room; the room crossfades between them (and between rooms).
  const records: RoomRecord[] = useMemo(
    () =>
      featured.map((album, i) => ({
        key: album.uri_release,
        room: releaseRoomFor(album),
        cover: getAlbumImageFromData(album.uri_release, 'hi-res'),
        alt: `${album.release_name} by ${album.release_artist}`,
        look: discLooks(album.vinyl_colours)[0] ?? null,
        labelColour: floods[i].ground,
        href: album.uri_release,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [featured.map(a => a.uri_release).join('|'), colours],
  );

  if (!current) {
    return <div className="h-[70vh] bg-[color:var(--ground)]" aria-busy="true" />;
  }

  // The progress bar is a CSS animation; when it finishes the hero moves on.
  // Only the visible copy of the controls animates (display:none stops it).
  const autoRotate = !reduced.current;

  const controls = (className: string) => (
    <div className={cn('items-center gap-3', className)}>
      <button type="button" className="icon-btn h-10 w-10 border-2 border-current md:h-12 md:w-12" onClick={() => go(index - 1)} aria-label="Previous record">
        <SkipBack className="h-5 w-5" fill="currentColor" />
      </button>
      <div className="flex min-w-0 flex-1 items-end gap-1.5 md:flex-none md:gap-3" role="group" aria-label="Latest additions">
        {featured.map((album, i) => (
          <button
            key={album.uri_release}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show ${album.release_name} by ${album.release_artist}`}
            aria-current={i === index}
            className="flex h-11 min-w-0 flex-1 flex-col justify-end gap-2 text-left md:w-9 md:flex-none"
          >
            <span className="t-mono text-[12px] font-bold">{String(i + 1).padStart(2, '0')}</span>
            <span className="relative h-[3px] overflow-hidden">
              <span className="absolute inset-0 opacity-30" style={{ background: 'currentColor' }} />
              {i === index && autoRotate && (
                <span
                  key={index}
                  className="hero-progress absolute inset-y-0 left-0 w-full origin-left"
                  style={{ background: 'currentColor', animationDuration: `${HERO_MS}ms` }}
                  onAnimationEnd={() => go(index + 1)}
                />
              )}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="icon-btn h-10 w-10 border-2 border-current md:h-12 md:w-12" onClick={() => go(index + 1)} aria-label="Next record">
        <SkipForward className="h-5 w-5" fill="currentColor" />
      </button>
    </div>
  );

  return (
    <>
      {/* Pulled up under the sticky header (64px, 84px from md), which is see-through here. */}
      <div className="relative -mt-16 md:-mt-[84px]">
        <ReleaseRoom
          records={records}
          active={index}
          tint={flood.flood}
          sticker={
            <Sticker
              key={current.uri_release}
              date={current.date_added}
              background={flood.ground}
              color={flood.flood}
              className="-right-12 -top-8 hidden md:flex"
            />
          }
          className="h-[clamp(460px,78svh,940px)]"
        />
      </div>
      <section
        className="flood-surface relative z-[2] transition-colors duration-700"
        style={{ background: flood.flood, color: flood.ink }}
      >
        <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-4 px-5 py-5 md:px-10 lg:flex-row lg:items-center lg:gap-10 lg:px-14">
          {/* The records' credits share one grid cell, so the band never changes height between them. */}
          <div className="grid min-w-0 flex-1">
            {featured.map((album, i) => {
              const on = i === index;
              const d = details[album.uri_release];
              const f = floods[i];
              const kicker = [
                originalYear(album),
                d?.label,
                album.format_primary,
                d && d.tracks > 0 ? `${d.sides > 1 ? `${d.sides} sides · ` : ''}${d.tracks} tracks` : null,
              ].filter(Boolean).join(' · ');
              return (
                <div
                  key={album.uri_release}
                  className={cn(
                    'min-w-0 transition-[opacity,transform] duration-700 [grid-area:1/1] motion-reduce:transition-none',
                    on ? 'translate-y-0 opacity-100 delay-200' : 'pointer-events-none translate-y-3 opacity-0',
                  )}
                  aria-hidden={!on}
                >
                  <p className="t-mono m-0 truncate text-[10px] uppercase tracking-[0.08em] md:text-[11px]" style={{ color: f.sub }}>
                    {kicker || '\u00a0'}
                  </p>
                  <Link to={album.uri_release} tabIndex={on ? 0 : -1} className="room-title-box">
                    <FitTitle max={96} min={20} fitHeight className="t-cond whitespace-nowrap leading-[0.9]">
                      {album.release_name.trim()}
                    </FitTitle>
                  </Link>
                  <p className="m-0 flex min-w-0 items-baseline gap-x-4 truncate">
                    <Link
                      to={album.artists?.[0]?.uri_artist ?? album.uri_artist}
                      tabIndex={on ? 0 : -1}
                      className="t-dispn truncate text-[18px] hover:underline md:text-[22px]"
                    >
                      {album.release_artist}
                    </Link>
                    <Link
                      to={album.uri_release}
                      tabIndex={on ? 0 : -1}
                      className="t-mono inline-flex shrink-0 items-center gap-1 text-[11px] font-bold uppercase hover:underline md:text-[12px]"
                    >
                      View album <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </p>
                </div>
              );
            })}
          </div>
          {controls('flex shrink-0')}
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------- Latest additions -- */

function LatestAdditions({ recent, colours }: { recent: Album[]; colours: Record<string, AlbumColorPalette> | null }) {
  const year = new Date().getFullYear();
  const thisYear = recent.filter(a => a.date_added?.startsWith(String(year))).length;
  return (
    <section>
      <SectionHeading
        title="Latest additions"
        note={thisYear ? `${thisYear} added in ${year}` : undefined}
        link={{ to: '/albums/1', label: 'All albums' }}
      />
      {/* Tall top padding so the discs a tile pops out on hover are not
          clipped by the scroller, pulled back up under the heading (which
          stays clickable through it) so the row sits where it did. */}
      <div className="shelf-scroll pointer-events-none relative -mx-5 -mt-32 scroll-px-5 gap-6 px-5 pb-4 pt-40 [&>*]:pointer-events-auto md:-mx-10 md:scroll-px-10 md:px-10 lg:-mx-14 lg:scroll-px-14 lg:gap-7 lg:px-14">
        {recent.slice(0, appConfig.homepage.recentlyAdded.displayCount).map(album => (
          <RecordTile
            key={album.uri_release}
            album={album}
            palette={colours?.[album.uri_release]}
            meta={`${formatShort(album.date_added)}${album.format_primary ? ` · ${album.format_primary}` : ''}`}
            className="w-[168px] shrink-0 md:w-[208px]"
            variant="flood"
          />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------ Most collected -- */

/** The six most collected artists as taped-up prints, as on the /artists wall. */
function MostCollected({ albums, colours }: { albums: Album[]; colours: Record<string, AlbumColorPalette> | null }) {
  const { top, artistCount } = useMemo(() => {
    const map = new Map<string, { name: string; uri: string; albums: Album[] }>();
    for (const a of albums) {
      for (const artist of a.artists ?? []) {
        if (!artist.uri_artist || artist.name === 'Various') continue;
        const e = map.get(artist.uri_artist) ?? { name: artist.name, uri: artist.uri_artist, albums: [] };
        e.albums.push(a);
        map.set(artist.uri_artist, e);
      }
    }
    const latestFirst = (x: Album[]) => [...x].sort((m, n) => n.date_added.localeCompare(m.date_added));
    return {
      top: [...map.values()].sort((x, y) => y.albums.length - x.albums.length).slice(0, 6).map(e => ({ ...e, albums: latestFirst(e.albums) })),
      artistCount: map.size,
    };
  }, [albums]);

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading title="Most collected" link={{ to: '/artists/1', label: `${artistCount.toLocaleString('en-GB')} artists` }} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:gap-x-6 lg:grid-cols-6">
        {top.map(e => (
          <ArtistCard
            key={e.uri}
            artist={{ name: e.name, uri: e.uri, albumCount: e.albums.length, image: getArtistImageFromData(e.uri, 'medium') }}
            records={e.albums.slice(0, 3)}
            palette={colours?.[e.albums[0].uri_release] ?? null}
            print
          />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Genres -- */

/**
 * The biggest genres as record-bin dividers, like the /albums run dividers: a card
 * in the colour of a recent bold sleeve from the genre, with the genre's three
 * latest records standing behind it and rising on hover.
 */
function Genres({ albums, colours }: { albums: Album[]; colours: Record<string, AlbumColorPalette> | null }) {
  const bins = useMemo(() => {
    const byDate = [...albums].sort((a, b) => b.date_added.localeCompare(a.date_added));
    return buildFacetValues(FACETS.genre, albums).slice(0, 8).map(g => {
      const inGenre = byDate.filter(a => FACETS.genre.extract(a).includes(g.name));
      const bold = colours && inGenre.find(a => (colours[a.uri_release]?.vivid ?? 0) >= BOLD_VIVID);
      return { ...g, colour: bold ? colours[bold.uri_release].flood : '#e8e2d6', sleeves: inGenre.slice(0, 3) };
    });
  }, [albums, colours]);

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading title="Genres" link={{ to: '/genres', label: 'All genres' }} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 md:gap-x-6 xl:grid-cols-8">
        {bins.map((g, i) => (
          <Link key={g.slug} to={`/genre/${g.slug}`} className={cn('genre-bin', i >= 4 && 'max-sm:hidden')} style={{ '--bin': g.colour, '--bin-ink': inkOn(g.colour) } as CSSProperties}>
            <span className="genre-bin-sleeves" aria-hidden>
              {g.sleeves.map((a, i) => (
                <img key={a.uri_release} src={getAlbumImageFromData(a.uri_release, 'medium')} alt="" loading="lazy" style={{ '--i': i } as CSSProperties} />
              ))}
            </span>
            <span className="genre-bin-card">
              {/* Sized to the longest word, so a name never breaks inside a word. */}
              <span className="t-disp genre-bin-name" style={{ fontSize: `${Math.min(17, 80 / (Math.max(...g.name.split(/[\s-]+/).map(w => w.length)) * 0.78))}cqw` }}>
                {g.name}
              </span>
              <span className="t-mono genre-bin-count">{g.count.toLocaleString('en-GB')} records</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Facts -- */

/**
 * Six facts from /stats, drawn at random on each visit: each record with a card
 * pinned under it, as on the /stats shelf. The facts come from public/stats/facts.json
 * (scripts/generate-stats.ts), a few KB.
 */
function Facts() {
  const [facts, setFacts] = useState<StatsHolder[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/stats/facts.json')
      .then(r => (r.ok ? (r.json() as Promise<StatsHolder[]>) : Promise.reject(new Error(String(r.status)))))
      .then(pool => alive && setFacts(pickHolders(pool, 6)))
      .catch(() => alive && setFacts([]));
    return () => {
      alive = false;
    };
  }, []);
  if (facts && !facts.length) return null;

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading title="By the numbers" link={{ to: '/stats', label: 'All the stats' }} />
      <div className="grid min-h-[260px] grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 md:gap-x-6 xl:grid-cols-6">
        {(facts ?? []).map((f, i) => (
          <Link key={f.s} to={`/album/${f.s}/`} className="fact-pin" aria-label={`${f.stat} ${f.label}. ${f.note}`}>
            <span className="fact-pin-sleeve">
              <img src={getAlbumImageUrl(f.s, 'medium')} alt="" loading="lazy" />
            </span>
            <span className="stats-tag" style={{ rotate: `${[-1.8, 1.2, -0.6, 1.6, -1.2, 0.8][i % 6]}deg` }}>
              <b>{f.stat}</b>
              <small>{f.label}</small>
              <em>{f.note}</em>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------- Random picks -- */

function RandomPicks({ albums, colours }: { albums: Album[]; colours: Record<string, AlbumColorPalette> | null }) {
  const [seed, setSeed] = useState(0);
  const picks = useMemo(() => shuffle(albums).slice(0, appConfig.homepage.randomCollection.displayCount), [albums, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!albums.length) return null;
  return (
    <section>
      <SectionHeading title="Random picks">
        <button type="button" className="pill pill-sm" onClick={() => setSeed(s => s + 1)}>
          <Shuffle className="h-4 w-4" aria-hidden />
          Shuffle
        </button>
      </SectionHeading>
      <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 lg:gap-x-7">
        {picks.map(album => (
          <RecordTile key={album.uri_release} album={album} palette={colours?.[album.uri_release]} meta={originalYear(album) ?? undefined} variant="flood" />
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------- Browse by colour -- */

function BrowseByColour({ albums, colours }: { albums: Album[]; colours: Record<string, AlbumColorPalette> | null }) {
  const wall = useMemo(() => {
    if (!colours) return [];
    return albums
      .filter(a => a.format_primary === 'Vinyl' && (colours[a.uri_release]?.vivid ?? 0) >= BOLD_VIVID)
      .sort((a, b) => b.date_added.localeCompare(a.date_added))
      .slice(0, 56)
      .sort((a, b) => colours[a.uri_release].hue - colours[b.uri_release].hue);
  }, [albums, colours]);
  if (!wall.length) return null;
  const strip = wall.filter((_, i) => i % 4 === 0);
  return (
    <section className="flex flex-col gap-7">
      <SectionHeading title="Browse by colour" link={{ to: '/albums/1?sort=colour', label: 'Open the colour wall' }} />
      <div className="flex h-3.5 overflow-hidden rounded-full" aria-hidden>
        {wall.map(a => (
          <span key={a.uri_release} className="flex-1" style={{ background: colours![a.uri_release].flood }} />
        ))}
      </div>
      <div className="grid grid-cols-7 md:grid-cols-[repeat(14,minmax(0,1fr))]">
        {strip.map(a => (
          <Link key={a.uri_release} to={a.uri_release} className="tile aspect-square" aria-label={`${a.release_name} by ${a.release_artist}`}>
            <img src={getAlbumImageFromData(a.uri_release, 'medium')} alt="" loading="lazy" />
          </Link>
        ))}
      </div>
      <Link to="/albums/1?sort=colour" className="inline-flex items-center gap-2 self-start font-bold md:hidden">
        Open the colour wall
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

/* ------------------------------------------------------------- Helpers -- */

function formatShort(date: string): string {
  const d = new Date(date);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${months[d.getMonth()]}`;
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
