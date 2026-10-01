import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Maximize, Pause, Play, SkipBack, SkipForward, Tv } from 'lucide-react';
import { Scrubber } from './Scrubber';
import { SoundIcon } from './SoundIcon';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { floodFor } from '@/lib/sleeveColour';
import { albumChannel, albumVideosRelease, formatDuration, loadTv, TV_ROOMS, videoPath, youTubeThumb, type TvChannel } from '@/lib/tv';
import { cn } from '@/lib/utils';
import { fetchYouTubeTitle, youTubeVideos } from '@/lib/youtube';
import type { Album } from '@/types/album';
import { TvRoom } from '@/pages/tv/TvRoom';
import { useTv } from './tv-context';

// One channel object per record for the tab, so the TV sees the same channel
// when you come back to the page.
const channelCache = new Map<string, TvChannel | null>();

/**
 * The record's channel: its tv.json entry, or, for a record tv.json leaves out
 * (every video a full-album rip or an audio upload), one built from the
 * release's own YouTube links with titles from YouTube. Either way the tab is
 * always the TV; null only when no link has a video id.
 */
async function buildChannel(album: Album, urls: string[]): Promise<TvChannel | null> {
  const release = await loadTv()
    .then(tv => tv.releases.find(r => r.uri === album.uri_release))
    .catch(() => undefined);
  if (release?.videos.length) return albumChannel(release, album);

  const seen = new Set<string>();
  const videos = youTubeVideos(urls).filter(v => !seen.has(v.id) && !!seen.add(v.id));
  if (!videos.length) return null;
  const titles = await Promise.all(videos.map(v => fetchYouTubeTitle(v.url)));
  return albumChannel(albumVideosRelease(album, videos.map((v, i) => ({ id: v.id, title: titles[i] }))), album, true);
}

function useAlbumChannel(album: Album, videos: string[]): TvChannel | null | undefined {
  const uri = album.uri_release;
  const [channel, setChannel] = useState<TvChannel | null | undefined>(() => channelCache.get(uri));

  useEffect(() => {
    if (channelCache.has(uri)) {
      setChannel(channelCache.get(uri));
      return;
    }
    let alive = true;
    buildChannel(album, videos).then(ch => {
      channelCache.set(uri, ch);
      if (alive) setChannel(ch);
    });
    return () => {
      alive = false;
    };
    // `videos` comes with the record, so `uri` covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, album]);

  return channel;
}

interface AlbumTvProps {
  album: Album;
  /** The release's YouTube URLs, for records tv.json leaves out. */
  videos: string[];
}

/**
 * The YouTube tab in Listen: a small russ.fm/tv, with the record's videos on
 * the set in its genre's room. It plays through the site-wide TV, so leaving
 * the page keeps it going in the floating player, which links back here.
 * Nothing loads from YouTube until the set is switched on.
 */
export function AlbumTv({ album, videos }: AlbumTvProps) {
  const channel = useAlbumChannel(album, videos);
  if (channel === undefined) return <div className="h-[520px] animate-pulse rounded-[14px] bg-[rgba(255,255,255,.04)] md:h-[640px]" aria-label="Loading videos" />;
  if (channel === null) return null;
  return <AlbumTvSet channel={channel} />;
}

function AlbumTvSet({ channel }: { channel: TvChannel }) {
  const tv = useTv();
  const { player, setSlot } = tv;
  const colours = useAlbumColorMap();
  const album = channel.items[0].album;
  const f = floodFor(colours?.[album.uri_release]);
  const room = TV_ROOMS.find(r => r.id === channel.room) ?? TV_ROOMS[0];

  const on = tv.active && tv.channel?.slug === channel.slug;
  const [picked, setPicked] = useState(0);
  const index = on ? tv.index : picked;
  const item = channel.items[index];

  // The picture only comes to this room while it's showing this record.
  const slotRef = useCallback((el: HTMLDivElement | null) => setSlot(el), [setSlot]);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!on) return setElapsed(0);
    setElapsed(tv.offset);
    const t = window.setInterval(() => setElapsed(player.time()), 1000);
    return () => window.clearInterval(t);
    // Restart the clock per video; `player.time` reads the live player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, item.id, player.ready]);

  // YouTube's own length once it knows it (tv.json's is an estimate); 0 while
  // a video with no known length is still loading.
  const duration = (on && player.duration()) || (item.untimed ? 0 : item.seconds);
  const seek = (seconds: number) => {
    player.seek(seconds);
    setElapsed(seconds);
  };

  const play = (i: number) => {
    if (on) tv.go(i);
    else {
      setPicked(i);
      tv.tune(channel, channel.items[i].id);
    }
  };
  const step = (delta: number) => {
    const n = channel.items.length;
    if (on) return delta > 0 ? tv.next() : tv.prev();
    setPicked(i => (((i + delta) % n) + n) % n);
  };
  const playPause = () => {
    if (!on) return play(index);
    if (player.playing) player.pause();
    else player.play();
  };

  const btn = { background: f.ink, color: f.flood };
  const outline = { color: f.ink };
  const many = channel.items.length > 1;

  return (
    <div className="tv overflow-hidden rounded-[14px]">
      <TvRoom
        room={room}
        tint={f.flood}
        slotRef={on ? slotRef : undefined}
        zoom={1.5}
        className="h-[260px] sm:h-[340px] lg:h-[400px]"
        picture={
          on ? undefined : (
            <>
              <img src={youTubeThumb(item.id, 'hq')} alt="" className="h-full w-full object-cover opacity-70" />
              <div className="tv-scan" aria-hidden />
            </>
          )
        }
        screen={
          on ? (
            <div className="tv-screen" onClick={() => (player.muted ? player.unmute() : playPause())}>
              <div className="tv-scan" aria-hidden />
              <div key={item.id} className="tv-static" aria-hidden>
                <svg width="100%" height="100%">
                  <filter id="album-tv-noise">
                    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
                    <feColorMatrix type="saturate" values="0" />
                  </filter>
                  <rect width="100%" height="100%" filter="url(#album-tv-noise)" />
                </svg>
              </div>
              <span className="tv-osd t-mono">
                {index + 1}/{channel.items.length}
              </span>
              <span className="tv-bug t-disp">russ.fm/tv</span>
              {player.muted && player.ready && (
                <span className="tv-sound t-mono" aria-hidden>
                  <SoundIcon muted className="h-3.5 w-3.5" /> Sound off
                </span>
              )}
              {player.failed && <span className="tv-message t-mono">The YouTube player didn't load</span>}
            </div>
          ) : (
            <button type="button" className="tv-screen flex items-center justify-center" onClick={() => play(index)} aria-label={`Switch on: ${item.title}`}>
              <span className="flex h-[22%] min-h-9 items-center justify-center rounded-full px-[7%] shadow-lg" style={btn}>
                <Play className="h-1/2 w-auto fill-current" aria-hidden />
              </span>
            </button>
          )
        }
      />

      {/* Now playing: one slim row, with the progress along the top: a
          scrubber like /tv's while it's on, a plain line before. */}
      <section className="tv-band relative px-3 pb-3 pt-4 md:px-4" style={{ background: f.flood, color: f.ink }} aria-label="Now playing">
        {on ? (
          <Scrubber elapsed={elapsed} duration={duration} onSeek={seek} />
        ) : (
          <div className="absolute inset-x-0 top-0 h-1.5 bg-[rgba(0,0,0,.35)]" aria-hidden />
        )}

        <div className="flex items-center gap-2 md:gap-3">
          {many && (
            <button type="button" className="icon-btn h-9 w-9 shrink-0" style={btn} onClick={() => step(-1)} aria-label="Previous video">
              <SkipBack className="h-4 w-4 fill-current" aria-hidden />
            </button>
          )}
          <button type="button" className="icon-btn h-11 w-11 shrink-0" style={btn} onClick={playPause} aria-label={on && player.playing ? 'Pause' : 'Play'}>
            {on && player.playing ? <Pause className="h-5 w-5 fill-current" aria-hidden /> : <Play className="h-5 w-5 fill-current" aria-hidden />}
          </button>
          {many && (
            <button type="button" className="icon-btn h-9 w-9 shrink-0" style={btn} onClick={() => step(1)} aria-label="Next video">
              <SkipForward className="h-4 w-4 fill-current" aria-hidden />
            </button>
          )}

          <div className="ml-1 min-w-0 flex-1">
            <p className="t-mono m-0 truncate text-[10px] uppercase tracking-[0.08em] opacity-75 md:text-[11px]">
              {index + 1} of {channel.items.length}
              {on ? ` · ${formatDuration(elapsed)}` : ''}
              {duration ? `${on ? ' / ' : ' · '}${formatDuration(duration)}` : ''}
              {item.kind === 'live' ? ' · Live' : ''}
              {item.artist !== album.release_artist ? ` · ${item.artist}` : ''}
            </p>
            <h3 className="t-cond m-0 truncate text-[20px] leading-[1.05] md:text-[24px]">{item.title}</h3>
          </div>

          {on && (
            <button
              type="button"
              className={cn('icon-btn h-9 w-9 shrink-0', !player.muted && 'border-2 border-current')}
              style={player.muted ? btn : outline}
              onClick={player.muted ? player.unmute : player.mute}
              aria-label={player.muted ? 'Sound on' : 'Mute'}
              title={player.muted ? 'Sound on' : 'Mute'}
            >
              <SoundIcon muted={player.muted} />
            </button>
          )}
          {on && (
            <button type="button" className="icon-btn hidden h-9 w-9 shrink-0 border-2 border-current sm:inline-flex" style={outline} onClick={tv.toggleFullscreen} aria-label="Full screen" title="Full screen">
              <Maximize className="h-4 w-4" aria-hidden />
            </button>
          )}
          <a
            href={`https://www.youtube.com/watch?v=${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-btn hidden h-9 w-9 shrink-0 border-2 border-current sm:inline-flex"
            style={outline}
            aria-label="Watch on YouTube"
            title="Watch on YouTube"
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
          <Link
            to={item.airsOn ? videoPath(item.airsOn, item) : '/tv'}
            className="icon-btn hidden h-9 w-9 shrink-0 border-2 border-current sm:inline-flex"
            style={outline}
            aria-label="Watch on russ.fm/tv"
            title="Watch on russ.fm/tv"
          >
            <Tv className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* The running order. */}
      {many && (
        <ol className="shelf-scroll m-0 flex list-none gap-3 bg-[rgba(0,0,0,.28)] p-3 md:gap-4 md:p-4" aria-label="Videos">
          {channel.items.map((v, i) => {
            const current = i === index;
            return (
              <li key={`${i}-${v.id}`} className="shrink-0">
                <button
                  type="button"
                  onClick={() => play(i)}
                  className={cn('group flex w-[150px] flex-col text-left md:w-[168px]', current ? 'opacity-100' : 'opacity-75 hover:opacity-100')}
                  aria-current={current ? 'true' : undefined}
                >
                  <span
                    className={cn('relative block aspect-video overflow-hidden bg-black', current && 'outline outline-[3px] outline-offset-[3px]')}
                    style={current ? { outlineColor: f.flood } : undefined}
                  >
                    <img
                      src={youTubeThumb(v.id)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                    <span className="t-mono absolute left-2 top-2 bg-[rgba(14,13,12,.85)] px-1.5 py-0.5 text-[11px] text-[color:var(--cream)]">
                      {current && on ? 'On now' : String(i + 1).padStart(2, '0')}
                    </span>
                    {!v.untimed && (
                      <span className="t-mono absolute bottom-2 right-2 bg-[rgba(14,13,12,.85)] px-1.5 py-0.5 text-[11px] text-[color:var(--cream)]">
                        {formatDuration(v.seconds)}
                      </span>
                    )}
                  </span>
                  <span className="t-cond mt-2 line-clamp-2 block text-[15px] leading-[1]">{v.title}</span>
                  {v.artist !== album.release_artist && <span className="mt-1 block truncate text-[13px] font-semibold">{v.artist}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
