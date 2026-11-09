import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Shuffle } from 'lucide-react';
import { usePageFlood } from '@/components/player';
import { ReleaseRoom, type RoomRecord } from '@/components/album/ReleaseRoom';
import { redesignConfig } from '@/config/redesign.config';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { getAlbumImageFromData, getReleaseRoomUrl } from '@/lib/image-utils';
import { releaseRoomFor } from '@/lib/releaseRooms';
import { originalYear } from '@/lib/releaseYear';
import { isReshuffleState } from '@/lib/shuffleLink';
import { floodFor, pageGround } from '@/lib/sleeveColour';
import { discLook } from '@/lib/vinylLook';
import { boardFor, type FlapLayout, type FlapRecord } from '@/lib/splitFlap';
import type { Album } from '@/types/album';
import { FlapBoard } from './FlapBoard';

/**
 * How many records the room keeps mounted. The room is handed a fixed ring of
 * slots so a record keeps its index while the next one is written into the
 * oldest slot; ReleaseRoom tracks the record on show by index, which is how it
 * parks the arm (same room) or crossfades the room (another room).
 */
const SLOTS = 4;

/**
 * rolling: the board is flipping to `next` while the room still plays the
 * record before it, at 45. idle: the board has landed and the room has `next`.
 */
type Phase = 'rolling' | 'idle';

interface ShuffleState {
  /** Records in the room, by slot. */
  slots: Album[];
  /** The slot on show in the room (and in the band's colour). */
  active: number;
  /** The record the board is showing or flipping to. */
  next: Album;
  phase: Phase;
}

type ShuffleAction = { type: 'shuffle'; next: Album } | { type: 'settled' };

function reducer(state: ShuffleState, action: ShuffleAction): ShuffleState {
  switch (action.type) {
    case 'shuffle':
      return state.phase === 'idle' ? { ...state, next: action.next, phase: 'rolling' } : state;
    case 'settled': {
      if (state.phase !== 'rolling') return state;
      // The first board lands on the record the room already has.
      if (state.slots[state.active] === state.next) return { ...state, phase: 'idle' };
      const slot = state.slots.length < SLOTS ? state.slots.length : (state.active + 1) % SLOTS;
      const slots = [...state.slots];
      slots[slot] = state.next;
      return { slots, active: slot, next: state.next, phase: 'idle' };
    }
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

/** The band's mono line: what the record is, as on the album page. */
function pressingLine(album: Album): string {
  return ['Shuffle', album.format_primary, album.labels?.[0], originalYear(album), album.country]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Shuffle: the record plays in its listening room (as on the album page) and
 * the band under the room is a split-flap board. Pressing Shuffle clatters the
 * board to a random record while the turntable runs at 45; once the last tile
 * lands, the room changes record (the arm parks and cues back in, or the room
 * crossfades to the new record's room) and the band takes its colour.
 */
export function ShuffleScene({ albums }: { albums: Album[] }) {
  const { wide, narrow, tickMs } = redesignConfig.random;
  const isWide = useMediaQuery('(min-width: 640px)');
  const layout: FlapLayout = isWide ? wide : narrow;
  const reducedMotion = usePrefersReducedMotion();
  const colorMap = useAlbumColorMap();

  const [{ slots, active, next, phase }, dispatch] = useReducer(reducer, albums, (list) => {
    const first = randomAlbum(list);
    return { slots: [first], active: 0, next: first, phase: 'rolling' as Phase };
  });
  const shown = slots[active];

  const cells = useMemo(() => boardFor(flapRecord(next), layout), [next, layout]);

  const shuffle = useCallback(() => {
    // Skip picks that would leave the board unchanged (duplicate pressings).
    const current = cells.join('');
    let pick = randomAlbum(albums);
    for (let tries = 0; tries < 10 && (pick === next || boardFor(flapRecord(pick), layout).join('') === current); tries++) {
      pick = randomAlbum(albums);
    }
    // Warm the sleeve and the room while the board flips.
    new Image().src = getAlbumImageFromData(pick.uri_release, 'hi-res');
    new Image().src = getReleaseRoomUrl(releaseRoomFor(pick).id, 'hi-res');
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

  const handleSettled = useCallback(() => dispatch({ type: 'settled' }), []);

  const shownFlood = floodFor(colorMap?.[shown.uri_release]);
  const nextFlood = floodFor(colorMap?.[next.uri_release]);

  usePageFlood(shownFlood.flood, shownFlood.ink, {
    cover: getAlbumImageFromData(shown.uri_release, 'hi-res'),
    ground: pageGround(shownFlood),
    vinyl: shown.vinyl_colours?.[0],
    room: true,
  });

  const records = useMemo<RoomRecord[]>(
    () =>
      slots.map((album, i) => ({
        // The same record can come up in two slots.
        key: `${i}:${album.uri_release}`,
        room: releaseRoomFor(album),
        cover: getAlbumImageFromData(album.uri_release, 'hi-res'),
        alt: `${album.release_name.trim()} by ${album.release_artist}`,
        look: discLook(album.vinyl_colours, 0),
        labelColour: floodFor(colorMap?.[album.uri_release]).ground,
        href: album.uri_release,
      })),
    [slots, colorMap],
  );

  const idle = phase === 'idle';
  const nextRecord = flapRecord(next);

  return (
    <div className="font-grot">
      <p className="sr-only" aria-live="polite">
        {idle ? `${shown.release_artist}, ${shown.release_name}` : ''}
      </p>

      {/* Pulled up under the sticky header (64px, 84px from md), which is see-through here. */}
      <div className="relative -mt-16 md:-mt-[84px]">
        <ReleaseRoom
          records={records}
          active={active}
          tint={shownFlood.flood}
          fast={!idle}
          className="h-[clamp(300px,46svh,860px)] md:h-[clamp(340px,58svh,860px)]"
        />
      </div>

      <section
        className="flood-surface relative z-[2] transition-colors duration-700"
        style={{ background: shownFlood.flood, color: shownFlood.ink }}
        aria-label="Shuffle"
      >
        <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-3 px-5 pb-6 pt-4 md:px-10 lg:px-14 lg:pb-8">
          <p className="t-mono m-0 text-[10px] uppercase leading-[1.5] tracking-[0.08em] md:text-[11px]" style={{ color: shownFlood.sub }}>
            {pressingLine(shown)}
          </p>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-10">
            <div className="min-w-0 flex-1">
              <FlapBoard
                layout={layout}
                cells={cells}
                onSettled={handleSettled}
                reducedMotion={reducedMotion}
                tickMs={tickMs}
                accent={nextFlood.glow}
                labelColour={shownFlood.sub}
                artist={nextRecord.artist}
                artistHref={artistHref(next)}
                title={nextRecord.title}
                albumHref={next.uri_release}
              />
            </div>
            <div className="flex shrink-0 gap-2.5">
              <button
                type="button"
                onClick={shuffle}
                disabled={!idle}
                className="pill pill-solid pill-lg flex-1 sm:flex-none"
                style={{ background: shownFlood.ink, color: shownFlood.flood }}
              >
                <Shuffle className="h-5 w-5" aria-hidden />
                {idle ? 'Shuffle' : 'Shuffling'}
              </button>
              <Link to={shown.uri_release} className="pill pill-lg max-sm:w-14 max-sm:px-0" aria-label="View album">
                <span className="max-sm:sr-only">View album</span>
                <ArrowRight className="h-5 w-5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
