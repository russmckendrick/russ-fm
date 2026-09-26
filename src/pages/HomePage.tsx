import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Pause, Play, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { appConfig } from '@/config/app.config';
import { loadDetailJson, useCollection } from '@/lib/collection';
import { useAlbumColorMap, type AlbumColorPalette } from '@/hooks/useAlbumColors';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { buildFacetValues, FACETS } from '@/lib/browseFacets';
import { getAlbumImageFromData, getArtistImageFromData } from '@/lib/image-utils';
import { floodFor, appleArtworkColours, hue, vividScore, inkOn, type Flood } from '@/lib/sleeveColour';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';
import {
  AFTER_HERO,
  CoverHero,
  HeroRecord,
  PillLink,
  RecordTile,
  SectionHeading,
  usePageFlood,
} from '@/components/player';

interface FeaturedDetail {
  tracks: number;
  sides: number;
  label?: string;
  apple: string[];
  spotify?: string;
  appleUrl?: string;
}

/** The fields the hero reads from a release's detail JSON. */
interface HeroDetailJson {
  tracklist?: Array<{ position?: string }>;
  labels?: string[];
  spotify_url?: string;
  apple_music_url?: string;
  services?: { spotify?: { url?: string }; apple_music?: { url?: string } };
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
      <div className={cn('mx-auto flex w-full max-w-[1640px] flex-col gap-20 px-5 pb-10 md:px-10 lg:gap-24 lg:px-14', AFTER_HERO)}>
        <LatestAdditions recent={recent} colours={colours} />
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-20">
          <MostCollected albums={albums} />
          <Genres albums={albums} colours={colours} />
        </div>
        <RandomPicks albums={albums} colours={colours} />
        <BrowseByColour albums={albums} colours={colours} />
      </div>
    </>
  );
}

/* --------------------------------------------------------------- Hero -- */

function Hero({ featured, colours }: { featured: Album[]; colours: Record<string, AlbumColorPalette> | null }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
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
              apple: appleArtworkColours(d.services),
              spotify: d.spotify_url ?? d.services?.spotify?.url,
              appleUrl: d.apple_music_url ?? d.services?.apple_music?.url,
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

  const floods: Flood[] = featured.map(a => floodFor(colours?.[a.uri_release], details[a.uri_release]?.apple));
  const current = featured[index];
  const flood = floods[index] ?? floodFor(null);
  usePageFlood(current ? flood.flood : null, current ? flood.ink : null);

  if (!current) {
    return <div className="h-[70vh] bg-[color:var(--ground)]" aria-busy="true" />;
  }

  // The progress bar is a CSS animation; when it finishes the hero moves on.
  // Pausing pauses the animation, so the bar and the rotation never drift.
  const autoRotate = !reduced.current;

  return (
    <CoverHero
      flood={flood}
      art={
        <div className="grid">
          {featured.map((album, i) => {
            const on = i === index;
            const f = floods[i];
            return (
              <div
                key={album.uri_release}
                className={cn(
                  '[grid-area:1/1] transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(.2,.8,.2,1)]',
                  on ? 'opacity-100 delay-200' : 'pointer-events-none translate-y-10 rotate-[-1.5deg] scale-[.97] opacity-0',
                )}
                aria-hidden={!on}
              >
                <Link to={album.uri_release} tabIndex={on ? 0 : -1} aria-label={`${album.release_name} by ${album.release_artist}`}>
                  <HeroRecord
                    src={getAlbumImageFromData(album.uri_release, 'hi-res')}
                    alt=""
                    labelColour={f.ground}
                    labelText={album.release_artist.toUpperCase()}
                    discOut={on ? 15 : 0}
                    spinning={on}
                    eager={i === 0}
                    sticker={on ? { date: album.date_added, background: f.ground, color: f.flood } : undefined}
                  />
                </Link>
              </div>
            );
          })}
        </div>
      }
    >
      <div className="grid">
        {featured.map((album, i) => {
          const on = i === index;
          const d = details[album.uri_release];
          const f = floods[i];
          const title = album.release_name.trim();
          const longest = Math.max(...title.split(/\s+/).map(w => w.length), 6);
          return (
            <div
              key={album.uri_release}
              className={cn(
                'flex flex-col gap-5 [grid-area:1/1] transition-[opacity,transform] duration-700 lg:gap-6',
                on ? 'translate-y-0 opacity-100 delay-200' : 'pointer-events-none translate-y-7 opacity-0',
              )}
              aria-hidden={!on}
            >
              <Link to={album.artists?.[0]?.uri_artist ?? album.uri_artist} tabIndex={on ? 0 : -1} className="t-dispn text-[22px] md:text-[30px]">
                {album.release_artist}
              </Link>
              <h1
                className="t-cond m-0"
                style={{ fontSize: `clamp(52px, ${Math.min(9, 60 / longest)}vw, ${Math.min(120, Math.floor(420 / (longest * 0.52)))}px)` }}
              >
                {title}
              </h1>
              <div className="t-kicker flex flex-wrap gap-x-4 gap-y-1" style={{ color: f.sub }}>
                <span>{album.date_release_year?.slice(0, 4)}</span>
                {d?.label && <span>{d.label}</span>}
                {album.format_primary && <span>{album.format_primary}</span>}
                {d && d.tracks > 0 && <span>{d.sides > 1 ? `${d.sides} sides · ` : ''}{d.tracks} tracks</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-2.5">
                <PillLink to={album.uri_release} solid={{ background: f.ink, color: f.flood }}>
                  View album
                </PillLink>
                {d?.spotify && <PillLink to={d.spotify}>Spotify</PillLink>}
                {d?.appleUrl && <PillLink to={d.appleUrl}>Apple Music</PillLink>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-end gap-3 lg:mt-10">
        <div className="flex items-end gap-3" role="group" aria-label="Latest additions">
          {featured.map((album, i) => (
            <button
              key={album.uri_release}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${album.release_name} by ${album.release_artist}`}
              aria-current={i === index}
              className="flex h-11 w-7 flex-col justify-end gap-2 text-left md:w-9"
            >
              <span className="t-mono text-[12px] font-bold">{String(i + 1).padStart(2, '0')}</span>
              <span className="relative h-[3px] overflow-hidden">
                <span className="absolute inset-0 opacity-30" style={{ background: 'currentColor' }} />
                {i === index && autoRotate && (
                  <span
                    key={index}
                    className="hero-progress absolute inset-y-0 left-0 w-full origin-left"
                    style={{ background: 'currentColor', animationDuration: `${HERO_MS}ms`, animationPlayState: playing ? 'running' : 'paused' }}
                    onAnimationEnd={() => go(index + 1)}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button type="button" className="icon-btn border-2 border-current" onClick={() => go(index - 1)} aria-label="Previous record">
          <SkipBack className="h-5 w-5" fill="currentColor" />
        </button>
        <button
          type="button"
          className="icon-btn"
          style={{ background: flood.ink, color: flood.flood }}
          onClick={() => setPlaying(p => !p)}
          aria-label={playing ? 'Pause rotation' : 'Resume rotation'}
        >
          {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
        </button>
        <button type="button" className="icon-btn border-2 border-current" onClick={() => go(index + 1)} aria-label="Next record">
          <SkipForward className="h-5 w-5" fill="currentColor" />
        </button>
      </div>
    </CoverHero>
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
      <div className="shelf-scroll -mx-5 mt-2 scroll-px-5 gap-6 px-5 pb-4 pt-6 md:-mx-10 md:scroll-px-10 md:px-10 lg:-mx-14 lg:scroll-px-14 lg:gap-7 lg:px-14">
        {recent.slice(0, appConfig.homepage.recentlyAdded.displayCount).map(album => (
          <RecordTile
            key={album.uri_release}
            album={album}
            palette={colours?.[album.uri_release]}
            meta={`${formatShort(album.date_added)}${album.format_primary ? ` · ${album.format_primary}` : ''}`}
            className="w-[168px] shrink-0 md:w-[208px]"
          />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------ Most collected -- */

function MostCollected({ albums }: { albums: Album[] }) {
  const top = useMemo(() => {
    const map = new Map<string, { name: string; uri: string; count: number }>();
    albums.forEach(a => {
      a.artists?.forEach(artist => {
        if (!artist.uri_artist || artist.name === 'Various') return;
        const e = map.get(artist.uri_artist) ?? { name: artist.name, uri: artist.uri_artist, count: 0 };
        e.count += 1;
        map.set(artist.uri_artist, e);
      });
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [albums]);
  const artistCount = useMemo(() => new Set(albums.flatMap(a => a.artists?.map(x => x.name) ?? [])).size, [albums]);

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading title="Most collected" link={{ to: '/artists/1', label: `${artistCount.toLocaleString('en-GB')} artists` }} />
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
        {top.map(artist => (
          <Link key={artist.uri} to={artist.uri} className="group flex flex-col gap-3.5">
            <div className="aspect-square overflow-hidden rounded-full bg-[color:var(--ground-3)]">
              <img
                src={getArtistImageFromData(artist.uri, 'medium')}
                alt={artist.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[16px] font-bold">{artist.name}</span>
              <span className="t-mono text-[13px] text-[color:var(--cream-dim)]">{artist.count}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Genres -- */

function Genres({ albums, colours }: { albums: Album[]; colours: Record<string, AlbumColorPalette> | null }) {
  const genres = useMemo(() => buildFacetValues(FACETS.genre, albums).slice(0, 14), [albums]);
  const genreColour = useMemo(() => {
    const out: Record<string, string> = {};
    if (!colours) return out;
    const byDate = [...albums].sort((a, b) => b.date_added.localeCompare(a.date_added));
    for (const g of genres) {
      const hit = byDate.find(a => FACETS.genre.extract(a).includes(g.name) && vividScore(colours[a.uri_release]?.accent ?? '') >= 1.2);
      out[g.name] = hit ? colours[hit.uri_release].accent : '#e8e2d6';
    }
    return out;
  }, [albums, colours, genres]);

  const vinyl = albums.filter(a => a.format_primary === 'Vinyl').length;
  const boxsets = albums.filter(a => a.format_primary === 'Box Set').length;
  const artists = new Set(albums.flatMap(a => a.artists?.map(x => x.name) ?? [])).size;
  const max = genres[0]?.count ?? 1;

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading title="Genres" link={{ to: '/genres', label: 'All genres' }} />
      <div className="flex flex-wrap content-start gap-3">
        {genres.map(g => {
          const bg = genreColour[g.name] ?? '#e8e2d6';
          const fs = Math.round(16 + (g.count / max) * 16);
          return (
            <Link
              key={g.slug}
              to={`/genre/${g.slug}`}
              className="chip"
              style={{ background: bg, color: inkOn(bg), fontSize: fs, padding: `${Math.round(fs * 0.45)}px ${Math.round(fs * 0.9)}px` }}
            >
              <span className="t-dispn">{g.name}</span>
              <span className="t-mono text-[12px] font-bold opacity-75">{g.count.toLocaleString('en-GB')}</span>
            </Link>
          );
        })}
      </div>
      <dl className="mt-2 grid grid-cols-2 border-t-2 border-[color:var(--cream)] sm:grid-cols-4">
        {[
          ['Records', albums.length],
          ['On vinyl', vinyl],
          ['Box sets', boxsets],
          ['Artists', artists],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse gap-1.5 py-5">
            <dt className="t-kicker text-[color:var(--cream-dim)]">{label}</dt>
            <dd className="t-disp m-0 text-[36px] md:text-[44px]">{Number(value).toLocaleString('en-GB')}</dd>
          </div>
        ))}
      </dl>
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
          <RecordTile key={album.uri_release} album={album} palette={colours?.[album.uri_release]} meta={album.date_release_year?.slice(0, 4)} />
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
      .filter(a => a.format_primary === 'Vinyl' && vividScore(colours[a.uri_release]?.accent ?? '') >= 1.2)
      .sort((a, b) => b.date_added.localeCompare(a.date_added))
      .slice(0, 56)
      .sort((a, b) => hue(colours[a.uri_release].accent) - hue(colours[b.uri_release].accent));
  }, [albums, colours]);
  if (!wall.length) return null;
  const strip = wall.filter((_, i) => i % 4 === 0);
  return (
    <section className="flex flex-col gap-7">
      <SectionHeading title="Browse by colour" link={{ to: '/albums/1?sort=colour', label: 'Open the colour wall' }} />
      <div className="flex h-3.5 overflow-hidden rounded-full" aria-hidden>
        {wall.map(a => (
          <span key={a.uri_release} className="flex-1" style={{ background: colours![a.uri_release].accent }} />
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
