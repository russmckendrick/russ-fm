import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Shuffle } from 'lucide-react';
import { Sleeve, Vinyl, usePageFlood } from '@/components/player';
import { redesignConfig } from '@/config/redesign.config';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { getAlbumImageFromData, getAlbumImageSrcSet, getAlbumSlug } from '@/lib/image-utils';
import { originalYear } from '@/lib/releaseYear';
import { isReshuffleState } from '@/lib/shuffleLink';
import { CREAM, floodFor, pageGround, subInk } from '@/lib/sleeveColour';
import { boardFor, type FlapLayout, type FlapRecord } from '@/lib/splitFlap';
import type { Album } from '@/types/album';
import { FlapBoard } from './FlapBoard';

/** How long the new colour takes to fall down the page (matches `.flap-drop`). */
const DROP_MS = 450;

/**
 * rolling: the board is flipping to `next`; the cover is turned edge-on so
 * the record behind it shows. dropping: `next`'s colour falls down the page.
 * idle: `shown` is `next`, the cover is back over the record.
 */
type Phase = 'rolling' | 'dropping' | 'idle';

interface ShuffleState {
  shown: Album | null;
  next: Album;
  phase: Phase;
}

type ShuffleAction =
  | { type: 'shuffle'; next: Album }
  | { type: 'settled'; reducedMotion: boolean }
  | { type: 'landed' };

function reducer(state: ShuffleState, action: ShuffleAction): ShuffleState {
  switch (action.type) {
    case 'shuffle':
      return state.phase === 'idle' ? { ...state, next: action.next, phase: 'rolling' } : state;
    case 'settled':
      if (state.phase !== 'rolling') return state;
      return action.reducedMotion ? { ...state, shown: state.next, phase: 'idle' } : { ...state, phase: 'dropping' };
    case 'landed':
      return state.phase === 'dropping' ? { ...state, shown: state.next, phase: 'idle' } : state;
  }
}

function flapRecord(album: Album): FlapRecord {
  return {
    artist: album.release_artist,
    title: album.release_name.trim(),
    year: String(originalYear(album) ?? ''),
    genres: getCleanGenresFromArray(album.genre_names ?? [], album.release_artist),
  };
}

function randomAlbum(albums: Album[]): Album {
  return albums[Math.floor(Math.random() * albums.length)];
}

function artistHref(album: Album): string {
  return album.artists?.[0]?.uri_artist ?? album.uri_artist;
}

/**
 * Shuffle: a split-flap board clatters to a random record, its colour drops
 * down the page, and the cover turns back over the spinning record.
 */
export function ShuffleScene({ albums }: { albums: Album[] }) {
  const { wide, narrow, tickMs } = redesignConfig.random;
  const isWide = useMediaQuery('(min-width: 640px)');
  const layout: FlapLayout = isWide ? wide : narrow;
  const reducedMotion = usePrefersReducedMotion();
  const colorMap = useAlbumColorMap();

  const [{ shown, next, phase }, dispatch] = useReducer(reducer, albums, (list) => ({
    shown: null,
    next: randomAlbum(list),
    phase: 'rolling' as Phase,
  }));

  const cells = useMemo(() => boardFor(flapRecord(next), layout), [next, layout]);

  const shuffle = useCallback(() => {
    // Skip picks that would leave the board unchanged (duplicate pressings).
    const current = cells.join('');
    let pick = randomAlbum(albums);
    for (let tries = 0; tries < 10 && (pick === next || boardFor(flapRecord(pick), layout).join('') === current); tries++) {
      pick = randomAlbum(albums);
    }
    new Image().src = getAlbumImageFromData(pick.uri_release, 'hi-res');
    dispatch({ type: 'shuffle', next: pick });
  }, [albums, cells, layout, next]);

  // A Shuffle link pressed while already on this page (header, menu, footer)
  // stays on the URL with `reshuffle` state; run a shuffle for each new one.
  const location = useLocation();
  const handledKey = useRef(location.key);
  const shuffleRef = useRef(shuffle);
  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);
  useEffect(() => {
    if (location.key === handledKey.current) return;
    handledKey.current = location.key;
    if (!isReshuffleState(location.state)) return;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    shuffleRef.current();
  }, [location.key, location.state, reducedMotion]);

  const handleSettled = useCallback(() => dispatch({ type: 'settled', reducedMotion }), [reducedMotion]);

  useEffect(() => {
    if (phase !== 'dropping') return;
    const id = window.setTimeout(() => dispatch({ type: 'landed' }), DROP_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  const shownFlood = shown ? floodFor(colorMap?.[shown.uri_release]) : null;
  const nextFlood = floodFor(colorMap?.[next.uri_release]);
  const ink = shownFlood?.ink ?? CREAM;
  const shownCover = shown ? getAlbumImageFromData(shown.uri_release, 'hi-res') : null;

  usePageFlood(shownFlood?.flood, shownFlood?.ink, {
    cover: shownCover,
    ground: shownFlood ? pageGround(shownFlood) : null,
  });

  const idle = phase === 'idle';
  const nextRecord = flapRecord(next);
  const cover = shown ?? next;

  return (
    <section
      className="relative isolate overflow-hidden font-grot"
      style={{ background: shownFlood?.flood ?? 'var(--ground)', color: ink }}
      aria-label="Shuffle"
    >
      {phase === 'dropping' && (
        <div key={next.uri_release} aria-hidden className="flap-drop absolute inset-0 -z-10" style={{ background: nextFlood.flood }} />
      )}

      <p className="sr-only" aria-live="polite">
        {idle && shown ? `${shown.release_artist}, ${shown.release_name}` : ''}
      </p>

      <div className="mx-auto flex min-h-[calc(100svh-64px)] w-full max-w-[1640px] flex-col items-center gap-5 px-5 pb-6 pt-5 sm:gap-7 sm:pb-8 sm:pt-6 md:min-h-[calc(100svh-84px)] md:px-10 lg:flex-row lg:gap-[clamp(48px,5vw,96px)] lg:px-14 lg:py-14">
        <div className="relative aspect-square w-[min(54vw,300px)] shrink-0 sm:w-[min(50vw,380px)] lg:w-[clamp(340px,34vw,560px)]">
          <Vinyl
            label={nextFlood.ground}
            cover={getAlbumImageFromData(next.uri_release, 'medium')}
            fast={!idle}
            className="vinyl-lit left-[3%] top-[3%] h-[94%] w-[94%]"
          />
          {/* Edge-on (and so invisible) until the board settles; on the first
              visit it holds the incoming record so it can turn in over it. */}
          <div
            className="flap-card absolute inset-0"
            style={{ transform: `perspective(1400px) rotateY(${idle ? 0 : 90}deg)` }}
          >
            <Sleeve
              src={getAlbumImageFromData(cover.uri_release, 'medium')}
              srcSet={getAlbumImageSrcSet(getAlbumSlug(cover.uri_release))}
              sizes="(min-width: 1024px) 560px, (min-width: 640px) 380px, 300px"
              alt={`${cover.release_artist}, ${cover.release_name}`}
              loading="eager"
              shrinkwrap
              className="h-full w-full"
            />
          </div>
        </div>

        <div className="w-full min-w-0 lg:max-w-[920px] lg:flex-1">
          <FlapBoard
            layout={layout}
            cells={cells}
            onSettled={handleSettled}
            reducedMotion={reducedMotion}
            tickMs={tickMs}
            accent={nextFlood.glow}
            labelColour={shownFlood?.sub ?? subInk(CREAM)}
            artist={nextRecord.artist}
            artistHref={artistHref(next)}
            title={nextRecord.title}
            albumHref={next.uri_release}
          />

          <div className="mt-5 flex gap-3 sm:mt-7 lg:mt-9">
            <button
              type="button"
              onClick={shuffle}
              disabled={!idle}
              className="pill pill-solid pill-lg flex-1 sm:flex-none"
              style={{ background: ink, color: shownFlood?.flood ?? 'var(--ground)' }}
            >
              <Shuffle className="h-5 w-5" aria-hidden />
              {idle ? 'Shuffle' : 'Shuffling'}
            </button>
            <Link
              to={cover.uri_release}
              className="pill pill-lg max-sm:w-14 max-sm:px-0"
              aria-label="View album"
            >
              <span className="max-sm:sr-only">View album</span>
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
