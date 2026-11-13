import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { List, Maximize, Pause, Play, SkipBack, SkipForward, Tv } from 'lucide-react';
import { SoundIcon } from '@/components/tv/SoundIcon';
import { FitTitle, HeroRecord, SectionHeading, usePageFlood } from '@/components/player';
import { Scrubber } from '@/components/tv/Scrubber';
import { isMissingThumb, useTv } from '@/components/tv/tv-context';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { useGlassBand } from '@/hooks/useGlassBand';
import { GLASS_TONE } from '@/lib/glassBand';
import { getAlbumImageFromData } from '@/lib/image-utils';
import { originalYear } from '@/lib/releaseYear';
import { floodFor, pageGround, colourBar } from '@/lib/sleeveColour';
import { discLooks } from '@/lib/vinylLook';
import { formatDuration, isArtistChannel, onAir, TV_ROOMS, videoPath, youTubeThumb, type TvChannel, type TvItem, type TvRoomId } from '@/lib/tv';
import { cn } from '@/lib/utils';
import { TvRoom } from './TvRoom';

interface TvSceneProps {
  channels: TvChannel[];
  channel: TvChannel;
  /** From a shared /tv/:channel/:video link. */
  videoId: string | null;
  videoCount: number;
}

const UP_NEXT = 6;

/**
 * The TV page: the room with the set, the now-playing band and the channel
 * lists. Playback itself belongs to TvProvider, so leaving the page keeps the
 * channel going in the floating player, and coming back picks it up again.
 */
export function TvScene({ channels, channel, videoId, videoCount }: TvSceneProps) {
  const colours = useAlbumColorMap();
  const tv = useTv();
  const { tune, setSlot, player } = tv;

  // Tune in: to the linked video, else to what is airing (a no-op when that is
  // already on, e.g. coming back from the floating player).
  const onThis = tv.channel?.slug === channel.slug;
  const playingRef = useRef<string | undefined>(undefined);
  playingRef.current = onThis ? tv.item?.id : undefined;
  const asked = useRef<string | null>(null);
  useEffect(() => {
    // Only a link to a different video (not our own address update) is a request.
    const wanted = videoId && videoId !== playingRef.current && channel.items.some(i => i.id === videoId);
    asked.current = wanted ? videoId : null;
    tune(channel, videoId);
  }, [tune, channel, videoId]);

  // Until the provider has caught up, show what the clock says is on.
  const index = onThis ? tv.index : onAir(channel).index;
  const item = onThis && tv.item ? tv.item : channel.items[index];

  // Keep the address on the video that is playing, so it can be shared. It
  // replaces the history entry (Back leaves the TV rather than stepping
  // through videos) and says so in its state, so the page doesn't scroll up.
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const playingId = onThis ? tv.item?.id : undefined;
  useEffect(() => {
    if (!onThis || !tv.item) return;
    // A linked video is still being tuned: don't overwrite its address yet.
    if (asked.current && tv.item.id !== asked.current) return;
    asked.current = null;
    const path = videoPath(channel.slug, tv.item);
    if (path !== pathname) navigate(path, { replace: true, state: { tvSync: true } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onThis, playingId, channel.slug]);

  const slotRef = useCallback((el: HTMLDivElement | null) => setSlot(el), [setSlot]);
  useEffect(() => () => setSlot(null), [setSlot]);

  // The header's height, which the room runs up under (matches Navigation: h-16, md:h-[84px]).
  const [headerH, setHeaderH] = useState(() => (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? 84 : 64));
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setHeaderH(mq.matches ? 84 : 64);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const [bandRef, bandInset] = useGlassBand<HTMLElement>();

  const [roomOverride, setRoomOverride] = useState<TvRoomId | null>(null);
  const room = TV_ROOMS.find(r => r.id === (roomOverride ?? channel.room)) ?? TV_ROOMS[0];
  const cycleRoom = () => setRoomOverride(TV_ROOMS[(TV_ROOMS.indexOf(room) + 1) % TV_ROOMS.length].id);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(tv.offset);
    const t = window.setInterval(() => setElapsed(player.time()), 1000);
    return () => window.clearInterval(t);
    // Restart the clock per video; `player.time` reads the live player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, player.ready]);

  // YouTube's own length once it knows it (the schedule's is an estimate).
  const duration = (onThis && player.duration()) || item.seconds;
  const seek = (seconds: number) => {
    player.seek(seconds);
    setElapsed(seconds);
  };

  const album = item.album;
  const f = floodFor(colours?.[album.uri_release]);
  const cover = getAlbumImageFromData(album.uri_release, 'medium');
  usePageFlood(f.flood, f.ink, { cover, ground: pageGround(f), vinyl: album.vinyl_colours?.[0] ?? null, room: true });

  const year = originalYear(album);
  const label = album.labels?.[0];
  // An artist's channel shows everything still to come (the whole running
  // order from the next video round to the one before this); genre channels
  // the next few.
  const allUpNext = isArtistChannel(channel);
  const upNext = useMemo(
    () =>
      Array.from({ length: Math.min(allUpNext ? Infinity : UP_NEXT, channel.items.length - 1) }, (_, k) => (index + 1 + k) % channel.items.length),
    [channel, index, allUpNext],
  );

  return (
    <div className="tv">
      {/* Room: pulled up under the sticky header (64px, 84px from md), which is
          see-through here, so the photo fills the top of the page. */}
      <div className="relative -mt-16 md:-mt-[84px]">
        <TvRoom
          room={room}
          tint={f.flood}
          slotRef={slotRef}
          zoom={1.35}
          topInset={headerH}
          bottomInset={bandInset}
          className="h-[404px] sm:h-[504px] md:h-[524px] lg:h-[clamp(640px,96svh,1100px)]"
          screen={
            <div className="tv-screen" onClick={() => (player.muted ? player.unmute() : undefined)}>
              <div className="tv-scan" aria-hidden />
              <div key={`${channel.slug}-${item.id}`} className="tv-static" aria-hidden>
                <svg width="100%" height="100%">
                  <filter id="tv-noise">
                    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
                    <feColorMatrix type="saturate" values="0" />
                  </filter>
                  <rect width="100%" height="100%" filter="url(#tv-noise)" />
                </svg>
              </div>
              <span className="tv-osd t-mono">CH {channel.number}</span>
              <span className="tv-bug t-disp">russ.fm/tv</span>
              {player.muted && player.ready && (
                <span className="tv-sound t-mono" aria-hidden>
                  <SoundIcon muted className="h-3.5 w-3.5" /> Sound off
                </span>
              )}
              {player.failed && <span className="tv-message t-mono">The YouTube player didn't load</span>}
            </div>
          }
        />

        {/* Now playing sits on the room itself, on glass, as on the home and
            album heroes: the credit on the left (one-line rows at fixed heights,
            so nothing moves between videos), transport and the extras on the
            right, the record standing at the end (desktop). Progress runs along
            the band's bottom edge. */}
        <section ref={bandRef} className="glass-band" style={{ '--band-tint': f.flood } as CSSProperties} aria-label="Now playing">
          <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-4 px-5 pb-7 md:px-10 lg:flex-row lg:items-end lg:gap-8 lg:px-14 lg:pb-8">
            <div className="min-w-0 flex-1">
              <p className="glass-sub t-mono m-0 truncate text-[10px] uppercase leading-[1.5] tracking-[0.08em] md:text-[11px]">
                CH {channel.number} · {channel.name} · <span className="tabular-nums">{formatDuration(elapsed)} / {formatDuration(duration)}</span>
                {item.kind === 'live' ? ' · Live' : ''}
              </p>
              <div className="room-title-box" title={item.title}>
                <FitTitle key={item.id} max={96} min={20} fitHeight className="t-cond whitespace-nowrap leading-[0.9]">
                  {item.title}
                </FitTitle>
              </div>
              <p className="m-0 flex min-w-0 items-baseline gap-x-4 whitespace-nowrap">
                {item.artist === album.release_artist ? (
                  <Link to={album.uri_artist} className="t-dispn shrink-0 text-[18px] hover:underline md:text-[22px]">
                    {item.artist}
                  </Link>
                ) : (
                  <span className="t-dispn shrink-0 text-[18px] md:text-[22px]">{item.artist}</span>
                )}
                <span className="t-mono truncate text-[11px] uppercase opacity-80 md:text-[12px]">
                  <Link to={album.uri_release} className="hover:underline">
                    {album.release_name}
                  </Link>
                  {year ? ` · ${year}` : ''}
                  {label ? ` · ${label}` : ''}
                </span>
              </p>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-5 lg:pb-1">
              <div className="flex items-center gap-2">
                <button type="button" className="icon-btn h-10 w-10 border-2 border-current md:h-12 md:w-12" onClick={tv.prev} aria-label="Previous video">
                  <SkipBack className="h-4 w-4 fill-current md:h-5 md:w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  className="icon-btn h-12 w-12 md:h-14 md:w-14"
                  style={GLASS_TONE}
                  onClick={() => (player.playing ? player.pause() : player.play())}
                  aria-label={player.playing ? 'Pause' : 'Play'}
                >
                  {player.playing ? <Pause className="h-5 w-5 fill-current md:h-6 md:w-6" aria-hidden /> : <Play className="h-5 w-5 fill-current md:h-6 md:w-6" aria-hidden />}
                </button>
                <button type="button" className="icon-btn h-10 w-10 border-2 border-current md:h-12 md:w-12" onClick={tv.next} aria-label="Next video">
                  <SkipForward className="h-4 w-4 fill-current md:h-5 md:w-5" aria-hidden />
                </button>
              </div>

              <span className="hidden h-8 w-px bg-current opacity-25 lg:block" aria-hidden />

              <div className="flex items-center gap-2">
                {/* Same shape either way: solid while muted (the one to press first), outlined with sound on. */}
                <button
                  type="button"
                  className={cn('icon-btn h-10 w-10', !player.muted && 'border-2 border-current')}
                  style={player.muted ? GLASS_TONE : undefined}
                  onClick={player.muted ? player.unmute : player.mute}
                  aria-label={player.muted ? 'Sound on' : 'Mute'}
                  title={player.muted ? 'Sound on' : 'Mute'}
                >
                  <SoundIcon muted={player.muted} />
                </button>
                <Link to="/tv/guide" className="icon-btn h-10 w-10 border-2 border-current" aria-label="Guide" title="Guide">
                  <List className="h-4 w-4" aria-hidden />
                </Link>
                <button
                  type="button"
                  className="icon-btn hidden h-10 w-10 border-2 border-current sm:inline-flex"
                  onClick={cycleRoom}
                  aria-label={`Change room (now ${room.name})`}
                  title={`Room: ${room.name}`}
                >
                  <Tv className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" className="icon-btn h-10 w-10 border-2 border-current" onClick={tv.toggleFullscreen} aria-label="Full screen" title="Full screen">
                  <Maximize className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            {/* The record of the video on screen, standing at the end of the band (desktop). */}
            <Link
              to={album.uri_release}
              className="hidden w-[150px] shrink-0 xl:block"
              aria-label={`${album.release_name} by ${album.release_artist}`}
            >
              <HeroRecord
                src={getAlbumImageFromData(album.uri_release, 'hi-res')}
                alt=""
                labelColour={f.ground}
                labelCover={cover}
                looks={discLooks(album.vinyl_colours)}
                discOut={28}
              />
            </Link>
          </div>

          {/* White on a pale track along the band's bottom edge; drag to seek. */}
          <Scrubber className="tv-scrub-foot" elapsed={elapsed} duration={duration} onSeek={seek} />
        </section>
      </div>

      {/* Up next -------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-[1640px] px-5 pt-10 md:px-10 md:pt-14 lg:px-14 lg:pt-16">
        <SectionHeading
          title="Up next"
          size="sm"
          note={allUpNext ? `${channel.items.length.toLocaleString('en-GB')} videos` : undefined}
          link={{ to: '/tv/guide', label: 'Full guide' }}
        />
        <div
          className={cn(
            'mt-5',
            allUpNext ? 'grid grid-cols-1 gap-x-5 gap-y-8 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 min-[1800px]:grid-cols-6' : 'shelf-scroll flex items-start gap-5',
          )}
        >
          {upNext
            .filter(i => !tv.dead.has(channel.items[i].id))
            .map(i => (
              <UpNextTile
                key={`${i}-${channel.items[i].id}`}
                item={channel.items[i]}
                onPick={() => tv.go(i)}
                onMissing={() => tv.markDead(channel.items[i].id)}
                colours={colours}
                fill={allUpNext}
              />
            ))}
        </div>
      </section>

      {/* Channels ------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-[1640px] px-5 pb-16 pt-12 md:px-10 md:pt-16 lg:px-14">
        <SectionHeading title="Channels" size="sm" note={`${videoCount.toLocaleString('en-GB')} videos`} />
        <ChannelGrid channels={channels} current={channel.slug} colours={colours} />
      </section>
    </div>
  );
}

type ColourMap = ReturnType<typeof useAlbumColorMap>;

/** A video still to come; `fill` makes it as wide as its grid cell instead of a fixed shelf width. */
function UpNextTile({
  item,
  onPick,
  onMissing,
  colours,
  fill,
}: {
  item: TvItem;
  onPick: () => void;
  /** The thumbnail is YouTube's placeholder for a missing video. */
  onMissing: () => void;
  colours: ColourMap;
  fill?: boolean;
}) {
  const f = floodFor(colours?.[item.album.uri_release]);
  const year = originalYear(item.album);
  return (
    <button type="button" onClick={onPick} className={cn('tv-tile group flex flex-col justify-start self-start text-left', fill ? 'w-full' : 'w-[240px] shrink-0 md:w-[260px]')}>
      <span className="relative block aspect-video overflow-hidden bg-black">
        <img
          src={youTubeThumb(item.id)}
          alt=""
          loading="lazy"
          onLoad={e => isMissingThumb(e.currentTarget) && onMissing()}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <span className="t-mono absolute bottom-2 right-2 bg-[rgba(14,13,12,.85)] px-1.5 py-0.5 text-[11px] text-[color:var(--cream)]">
          {formatDuration(item.seconds)}
        </span>
      </span>
      <span className="block h-2" style={{ background: colourBar(f) }} />
      <span className="t-cond mt-3 line-clamp-2 block text-[28px] leading-[0.95]">{item.title}</span>
      <span className="mt-1.5 block truncate text-[15px] font-semibold">{item.artist}</span>
      <span className="t-mono mt-1 block truncate text-[12px] text-[color:var(--cream-dim)]">
        {item.album.release_name}
        {year ? ` · ${year}` : ''}
      </span>
    </button>
  );
}

function ChannelGrid({ channels, current, colours }: { channels: TvChannel[]; current: string; colours: ColourMap }) {
  // Each tile shows what is airing on it now, so refresh now and then.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {channels.map(ch => {
        const airing = ch.items[onAir(ch, now).index];
        const f = floodFor(colours?.[airing.album.uri_release]);
        const on = ch.slug === current;
        return (
          <Link
            key={ch.slug}
            to={`/tv/${ch.slug}`}
            className={cn('flex min-h-[84px] items-center gap-3.5 px-4 py-3 transition-transform hover:-translate-y-0.5', on && 'outline outline-[3px] outline-offset-[3px] outline-[color:var(--cream)]')}
            style={{ background: f.flood, color: f.ink }}
            aria-current={on ? 'page' : undefined}
          >
            <span className="t-cond text-[46px] leading-none">{ch.number}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-bold leading-tight">{ch.name}</span>
              <span className="t-mono truncate text-[11px] opacity-75">
                {airing.artist} · {airing.title}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
