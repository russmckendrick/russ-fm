import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Shuffle } from 'lucide-react';
import { usePageFlood } from '@/components/player';
import { IndexRoom } from '@/components/browse/IndexRoom';
import { redesignConfig } from '@/config/redesign.config';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { getAlbumImageFromData } from '@/lib/image-utils';
import { indexRoom, indexRoomSlots } from '@/lib/indexHeaders';
import { originalYear } from '@/lib/releaseYear';
import { isReshuffleState } from '@/lib/shuffleLink';
import { floodFor, pageGround } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';

const ROOM = 'shuffle';
const SLOTS = indexRoomSlots(ROOM);

function randomAlbum(albums: Album[]): Album {
  return albums[Math.floor(Math.random() * albums.length)];
}

/** A random record not already on the shelf (a few tries, for small collections). */
function freshAlbum(albums: Album[], shelf: Album[]): Album {
  let pick = randomAlbum(albums);
  for (let tries = 0; tries < 12 && shelf.includes(pick); tries++) pick = randomAlbum(albums);
  return pick;
}

function artistHref(album: Album): string {
  return album.artists?.[0]?.uri_artist ?? album.uri_artist;
}

/** The band's mono line: what the record is, as on the album page. */
function pressingLine(album: Album): string {
  return ['Shuffle', album.format_primary, originalYear(album), album.labels?.[0], album.country].filter(Boolean).join(' · ');
}

/**
 * The title's size: as big as the band allows (40px to 96px), shrunk so the
 * whole title fits one line of the text column (container units; a condensed
 * capital is about half an em wide). Very long titles stop at 28px and end
 * in an ellipsis.
 */
function titleSize(title: string): string {
  return `min(clamp(40px, 7vw, 96px), max(28px, calc(100cqw / ${Math.max(6, title.length * 0.5).toFixed(1)})))`;
}

/**
 * The slots wholly on screen. The photo covers the box (as IndexRoom draws it)
 * with the row centred across, so a narrow box crops the ends of the row; the
 * chase only stops where you can see it.
 */
function visibleSlots(box: { w: number; h: number } | null): number[] {
  const all = Array.from({ length: SLOTS }, (_, i) => i);
  if (!box || box.w === 0) return all;
  const { aspect, slots } = indexRoom(ROOM);
  const width = Math.max(box.w, box.h * aspect) * 1.02;
  const rowLeft = Math.min(...slots.map(s => s.left));
  const rowRight = Math.max(...slots.map(s => s.left + s.width));
  const left = Math.min(0, Math.max(box.w - width, box.w / 2 - ((rowLeft + rowRight) / 200) * width));
  const seen = all.filter(i => {
    const s = slots[i];
    const x0 = left + (s.left / 100) * width;
    return x0 >= 0 && x0 + (s.width / 100) * width <= box.w;
  });
  return seen.length ? seen : all;
}

/**
 * Shuffle: eight records on the rail behind a shop counter (IndexRoom, the
 * "shuffle" photo). Pressing Shuffle sends a light chasing along the row like
 * a fruit-machine reel, each sleeve flipping to a new record as it passes; it
 * slows and stops on one, the rest fall into shadow, a price-gun tag sticks
 * under the pick and the band underneath takes its colour. Every sleeve on
 * the rail links to its record.
 */
export function ShuffleScene({ albums }: { albums: Album[] }) {
  const reducedMotion = usePrefersReducedMotion();
  const colorMap = useAlbumColorMap();

  const [shelf, setShelf] = useState<Album[]>(() => {
    const out: Album[] = [];
    for (let i = 0; i < SLOTS; i++) out.push(freshAlbum(albums, out));
    return out;
  });
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [pick, setPick] = useState(() => Math.floor(SLOTS / 2) - 1);
  // No lamp is on until the first chase reaches one.
  const [lit, setLit] = useState(-1);
  // The page opens chasing: nothing is picked until the first chase lands.
  const [chasing, setChasing] = useState(true);
  const [landed, setLanded] = useState(false);
  // The record the last chase landed on. Kept apart from the shelf, since the
  // next chase flips its slot over before it lands somewhere new.
  const [picked, setPicked] = useState<Album | null>(null);
  const shown = picked ?? shelf[pick];

  // The box the photo covers, to know which slots are on screen.
  const wrap = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onScreen = useMemo(() => visibleSlots(box), [box]);

  // A first pick that is on screen.
  useEffect(() => {
    if (!chasing && !onScreen.includes(pick)) {
      const mid = onScreen[Math.floor((onScreen.length - 1) / 2)];
      setPick(mid);
      setLit(mid);
    }
  }, [onScreen, pick, chasing]);

  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(t => window.clearTimeout(t)), []);

  const chase = useCallback(() => {
    const { minSteps, maxSteps, stepMs, slowMs, holdSteps } = redesignConfig.random;
    let steps = minSteps + Math.floor(Math.random() * (maxSteps - minSteps + 1));
    // Stop on a slot that is on screen.
    while (!onScreen.includes((pick + steps) % SLOTS)) steps++;

    // Plan the whole chase up front so the records it flips to load meanwhile.
    const next = [...shelf];
    const plan: { slot: number; album?: Album; at: number }[] = [];
    let at = 0;
    for (let k = 0; k < steps; k++) {
      const slot = (pick + 1 + k) % SLOTS;
      let album: Album | undefined;
      if (k < steps - holdSteps) {
        album = freshAlbum(albums, next);
        next[slot] = album;
        new Image().src = getAlbumImageFromData(album.uri_release, 'medium');
      }
      plan.push({ slot, album, at });
      at += stepMs + k * k * slowMs;
    }
    const stop = (pick + steps) % SLOTS;
    // The pick's band and page colours, warmed for when it lands.
    new Image().src = getAlbumImageFromData(next[stop].uri_release, 'hi-res');

    if (reducedMotion) {
      setShelf(next);
      setPick(stop);
      setLit(stop);
      setChasing(false);
      setLanded(true);
      setPicked(next[stop]);
      return;
    }

    setChasing(true);
    timers.current = plan.map(({ slot, album, at: t }) =>
      window.setTimeout(() => {
        setLit(slot);
        if (album) setShelf(s => s.map((a, i) => (i === slot ? album : a)));
      }, t),
    );
    timers.current.push(
      window.setTimeout(() => {
        setPick(stop);
        setChasing(false);
        setLanded(true);
        setPicked(next[stop]);
      }, at + 240),
    );
  }, [albums, onScreen, pick, reducedMotion, shelf]);

  const shuffle = useCallback(() => {
    if (!chasing) chase();
  }, [chase, chasing]);

  // Shuffle on arrival: the first chase starts once the shop photo shows.
  const started = useRef(false);
  const chaseRef = useRef(chase);
  useEffect(() => {
    chaseRef.current = chase;
  }, [chase]);
  const handleLoaded = useCallback(() => {
    if (started.current) return;
    started.current = true;
    timers.current.push(window.setTimeout(() => chaseRef.current(), reducedMotion ? 0 : 450));
  }, [reducedMotion]);

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

  // Until the first chase lands the band is neutral and names no record.
  const flood = floodFor(landed ? colorMap?.[shown.uri_release] : null);
  usePageFlood(flood.flood, flood.ink, {
    cover: landed ? getAlbumImageFromData(shown.uri_release, 'hi-res') : undefined,
    ground: pageGround(flood),
    vinyl: landed ? shown.vinyl_colours?.[0] : undefined,
    room: true,
  });

  const year = originalYear(shown);
  const genres = getCleanGenresFromArray(shown.genre_names ?? [], shown.release_artist).slice(0, 3);
  const title = shown.release_name.trim();
  const litSlot = chasing ? lit : pick;
  // The band names the pick only while it is settled: every chase, the first
  // too, shows the "Shuffling…" placeholder (in the last pick's colours).
  const showing = landed && !chasing;

  return (
    <div className="font-grot">
      <p className="sr-only" aria-live="polite">
        {chasing ? '' : `${shown.release_artist}, ${title}`}
      </p>

      {/* Pulled up under the sticky header (64px, 84px from md), which is see-through here. */}
      <div ref={wrap} className="relative -mt-16 h-[clamp(380px,110vw,560px)] md:-mt-[84px] md:h-[clamp(440px,64svh,700px)]">
        <IndexRoom
          room={ROOM}
          tint={flood.flood}
          className={cn('h-full', !chasing && 'ledge-idle')}
          onLoaded={handleLoaded}
          slotClassName="ledge-sleeve"
          renderSlot={i => {
            const a = shelf[i];
            return (
              <Link
                to={a.uri_release}
                className="index-room-sleeve"
                title={`${a.release_name.trim()} — ${a.release_artist}`}
                aria-label={`${a.release_name.trim()} by ${a.release_artist}`}
                tabIndex={chasing ? -1 : undefined}
              >
                <img key={a.uri_release} src={getAlbumImageFromData(a.uri_release, 'medium')} alt="" decoding="async" className="ledge-flip" />
                <span className={cn('ledge-dim', i !== litSlot && 'is-dim')} aria-hidden />
              </Link>
            );
          }}
          renderOver={i => (
            <>
              {/* The spotlight over each sleeve, on with the light and off in shadow. */}
              <span className={cn('ledge-lamp', i === litSlot && 'is-on')} aria-hidden />
              {showing && i === pick && (
                <span key={shown.uri_release} className="ledge-tag" style={{ background: flood.flood, color: flood.ink }} aria-hidden>
                  Pick{year ? ` · ${year}` : ''}
                </span>
              )}
            </>
          )}
        />
      </div>

      <section
        className="flood-surface relative z-[2] transition-colors duration-700"
        style={{ background: flood.flood, color: flood.ink }}
        aria-label="Shuffle"
      >
        <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-5 px-5 py-6 md:px-10 lg:flex-row lg:items-end lg:gap-10 lg:px-14 lg:py-8">
          {/* Every row is one line at a fixed height, so the band never changes size between records. */}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 [container-type:inline-size] md:gap-3">
            <p
              className="t-mono m-0 truncate whitespace-nowrap text-[10px] uppercase leading-[1.5] tracking-[0.08em] md:text-[11px]"
              style={{ color: flood.sub }}
            >
              {showing ? pressingLine(shown) : `Shuffle · ${albums.length.toLocaleString('en-GB')} records`}
            </p>
            <p className="t-dispn m-0 truncate whitespace-nowrap text-[20px] leading-[1.2] md:text-[26px]">
              {showing ? (
                <Link to={artistHref(shown)} className="hover:underline">
                  {shown.release_artist}
                </Link>
              ) : (
                <span className="opacity-50">Picking a record</span>
              )}
            </p>
            <h1 className="t-cond m-0 flex h-[clamp(40px,7vw,96px)] items-end leading-[0.95]" style={{ fontSize: titleSize(showing ? title : 'Shuffling…') }}>
              {showing ? (
                <Link to={shown.uri_release} className="block min-w-0 max-w-full truncate hover:underline" title={title}>
                  {title}
                </Link>
              ) : (
                <span className="block truncate">Shuffling…</span>
              )}
            </h1>
            <p className="t-kicker m-0 flex gap-x-4 overflow-hidden whitespace-nowrap" style={{ color: flood.sub }}>
              {showing && genres.length > 0 ? genres.map(g => <span key={g}>{g}</span>) : <span aria-hidden>&nbsp;</span>}
            </p>
          </div>
          <div className="flex shrink-0 gap-2.5">
            <button
              type="button"
              onClick={shuffle}
              disabled={chasing}
              className="pill pill-solid pill-lg flex-1 justify-center sm:min-w-[11.5rem] sm:flex-none"
              style={{ background: flood.ink, color: flood.flood }}
            >
              <Shuffle className="h-5 w-5" aria-hidden />
              {chasing ? 'Shuffling' : 'Shuffle'}
            </button>
            {showing ? (
              <Link to={shown.uri_release} className="pill pill-lg max-sm:w-14 max-sm:px-0" aria-label="View album">
                <span className="max-sm:sr-only">View album</span>
                <ArrowRight className="h-5 w-5" aria-hidden />
              </Link>
            ) : (
              // Held in place, greyed out, until the first chase picks a record.
              <span className="pill pill-lg cursor-default opacity-40 max-sm:w-14 max-sm:px-0" role="link" aria-disabled="true" aria-label="View album">
                <span className="max-sm:sr-only">View album</span>
                <ArrowRight className="h-5 w-5" aria-hidden />
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
