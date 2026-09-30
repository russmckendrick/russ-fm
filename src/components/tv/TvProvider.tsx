import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Maximize2, Minimize, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { getAlbumImageFromData } from '@/lib/image-utils';
import { originalYear } from '@/lib/releaseYear';
import { floodFor } from '@/lib/sleeveColour';
import { formatDuration, onAir, videoPath, type TvChannel } from '@/lib/tv';
import { TvContext, type TvState } from './tv-context';
import { useTvPlayer } from './useTvPlayer';

interface Tuning {
  channel: TvChannel | null;
  index: number;
  offset: number;
  /** Bumped on every change of video, so the same index can be reloaded. */
  seq: number;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Owns the one YouTube player for the whole site. The player lives in a layer
 * outside the routes, so it is never unmounted (moving an iframe reloads it):
 * on the TV page the layer is laid over the room's screen, behind the photo's
 * cut-out glass; on any other page it floats bottom left until closed.
 */
export function TvProvider({ children }: { children: ReactNode }) {
  const [tuning, setTuning] = useState<Tuning>({ channel: null, index: 0, offset: 0, seq: 0 });
  const [active, setActive] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const activeRef = useRef(false);
  activeRef.current = active;

  const { channel } = tuning;
  const count = channel?.items.length ?? 0;
  const index = count ? tuning.index % count : 0;
  const item = channel?.items[index] ?? null;

  const step = useCallback((delta: number) => {
    setTuning(t => {
      if (!t.channel) return t;
      const n = t.channel.items.length;
      return { ...t, index: (((t.index + delta) % n) + n) % n, offset: 0, seq: t.seq + 1 };
    });
  }, []);
  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);
  const go = useCallback((i: number) => {
    setTuning(t => (t.channel ? { ...t, index: i % t.channel.items.length, offset: 0, seq: t.seq + 1 } : t));
  }, []);

  const host = useRef<HTMLDivElement>(null);
  const player = useTvPlayer(host, { enabled, onEnded: next, onError: next });

  const tune = useCallback((ch: TvChannel, videoId?: string | null) => {
    const wasOn = activeRef.current;
    setEnabled(true);
    setActive(true);
    setTuning(t => {
      const asked = videoId ? ch.items.findIndex(i => i.id === videoId) : -1;
      const sameChannel = wasOn && t.channel?.slug === ch.slug;
      if (asked >= 0) {
        if (sameChannel && t.channel!.items[t.index % t.channel!.items.length]?.id === videoId) return t;
        return { channel: ch, index: asked, offset: 0, seq: t.seq + 1 };
      }
      return sameChannel ? t : { channel: ch, ...onAir(ch), seq: t.seq + 1 };
    });
  }, []);

  // Load whenever the video changes (or the TV is switched back on).
  const loadRef = useRef(player.load);
  loadRef.current = player.load;
  useEffect(() => {
    if (active && item) loadRef.current(item.id, tuning.offset);
    // Only a new tuning (seq) or switching on should load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuning.seq, active]);

  // Full screen -------------------------------------------------------------
  const layer = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(!!layer.current && document.fullscreenElement === layer.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void layer.current?.requestFullscreen?.();
  }, []);

  const pause = player.pause;
  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    pause();
    setActive(false);
  }, [pause]);

  // Where the layer goes ----------------------------------------------------
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (!slot) {
      setRect(null);
      return;
    }
    // Page coordinates, so the layer scrolls with the page without tracking scroll.
    const measure = () => {
      const r = slot.getBoundingClientRect();
      setRect({ left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(slot);
    ro.observe(document.body);
    const mo = new MutationObserver(measure);
    mo.observe(slot, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [slot]);

  const mode = !active ? 'off' : slot ? 'page' : 'mini';
  const layerStyle =
    mode === 'page' && rect && !fullscreen
      ? ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, '--sw': `${rect.width}px`, '--sh': `${rect.height}px` } as CSSProperties)
      : undefined;

  const value = useMemo<TvState>(
    () => ({ active, channel, index, item, offset: tuning.offset, player, fullscreen, tune, go, next, prev, close, toggleFullscreen, setSlot }),
    [active, channel, index, item, tuning.offset, player, fullscreen, tune, go, next, prev, close, toggleFullscreen],
  );

  return (
    <TvContext.Provider value={value}>
      {children}
      <div ref={layer} className="tv-layer" data-mode={mode} style={layerStyle}>
        <TvLayerVideo host={host} mode={mode} value={value} />
      </div>
    </TvContext.Provider>
  );
}

function TvLayerVideo({ host, mode, value }: { host: React.RefObject<HTMLDivElement | null>; mode: string; value: TvState }) {
  const colours = useAlbumColorMap();
  const navigate = useNavigate();
  const { item, channel, player, fullscreen } = value;
  const album = item?.album;
  const f = floodFor(album ? colours?.[album.uri_release] : null);
  const year = album ? originalYear(album) : null;
  const label = album?.labels?.[0];
  const back = channel?.home ?? (channel && item ? videoPath(channel.slug, item) : '/tv');

  return (
    <>
      <div
        className="tv-layer-video"
        onClick={mode === 'mini' ? () => navigate(back) : undefined}
        role={mode === 'mini' ? 'link' : undefined}
        aria-label={mode === 'mini' ? (channel?.home ? 'Back to the record' : 'Back to TV') : undefined}
      >
        <div ref={host} className="tv-player" />
        <div className="tv-scan" aria-hidden />
        {album && item && fullscreen && channel && (
          <FullscreenCredit value={value} flood={f.flood} ink={f.ink} year={year} label={label} />
        )}
      </div>

      {mode === 'mini' && item && (
        <div className="tv-mini-bar" style={{ background: f.flood, color: f.ink }}>
          <Link to={back} className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[12px] font-bold">{item.artist}</span>
            <span className="t-cond truncate text-[20px] leading-none">{item.title}</span>
          </Link>
          <button
            type="button"
            className="tv-mini-btn"
            onClick={() => (player.playing ? player.pause() : player.play())}
            aria-label={player.playing ? 'Pause' : 'Play'}
          >
            {player.playing ? <Pause className="h-4 w-4 fill-current" aria-hidden /> : <Play className="h-4 w-4 fill-current" aria-hidden />}
          </button>
          <button
            type="button"
            className="tv-mini-btn"
            onClick={player.muted ? player.unmute : player.mute}
            aria-label={player.muted ? 'Sound on' : 'Mute'}
          >
            {player.muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
          </button>
          <Link to={back} className="tv-mini-btn" aria-label={channel?.home ? 'Back to the record' : 'Back to TV'}>
            <Maximize2 className="h-4 w-4" aria-hidden />
          </Link>
          <button type="button" className="tv-mini-btn" onClick={value.close} aria-label="Turn off TV">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Full screen: the credit block, the way music TV did it, kept up the whole
 * time and doubling as the remote (progress, previous/play/next, sound, exit).
 */
function FullscreenCredit({ value, flood, ink, year, label }: { value: TvState; flood: string; ink: string; year: number | null; label?: string }) {
  const { item, channel, player, offset } = value;
  const [elapsed, setElapsed] = useState(offset);
  useEffect(() => {
    setElapsed(offset);
    const t = window.setInterval(() => setElapsed(player.time()), 1000);
    return () => window.clearInterval(t);
    // Restart per video; `player.time` reads the live player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);
  if (!item || !channel) return null;
  const album = item.album;
  const btn = { background: ink, color: flood };

  return (
    <div className="tv-credit" style={{ background: flood, color: ink }}>
      <img src={getAlbumImageFromData(album.uri_release, 'medium')} alt="" />
      <div className="tv-credit-text">
        <span className="t-mono tv-credit-kicker">
          CH {channel.number} · {channel.name}
        </span>
        <span className="t-dispn">{item.artist}</span>
        <span className="t-cond">{item.title}</span>
        <span className="t-mono">
          {album.release_name}
          {year ? ` · ${year}` : ''}
          {label ? ` · ${label}` : ''}
        </span>
        <div className="tv-credit-progress">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full">
            <div className="absolute inset-0 opacity-25" style={{ background: ink }} />
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-1000 ease-linear"
              style={{ background: ink, width: `${Math.min(100, (elapsed / item.seconds) * 100)}%` }}
            />
          </div>
          <span className="t-mono w-[92px] shrink-0 tabular-nums">
            {formatDuration(elapsed)} / {formatDuration(item.seconds)}
          </span>
        </div>
        <div className="tv-credit-controls">
          <button type="button" className="icon-btn" style={btn} onClick={value.prev} aria-label="Previous video">
            <SkipBack className="h-5 w-5 fill-current" aria-hidden />
          </button>
          <button
            type="button"
            className="icon-btn h-14 w-14"
            style={btn}
            onClick={() => (player.playing ? player.pause() : player.play())}
            aria-label={player.playing ? 'Pause' : 'Play'}
          >
            {player.playing ? <Pause className="h-6 w-6 fill-current" aria-hidden /> : <Play className="h-6 w-6 fill-current" aria-hidden />}
          </button>
          <button type="button" className="icon-btn" style={btn} onClick={value.next} aria-label="Next video">
            <SkipForward className="h-5 w-5 fill-current" aria-hidden />
          </button>
          <button
            type="button"
            className="icon-btn"
            style={{ color: ink, border: `2px solid ${ink}` }}
            onClick={player.muted ? player.unmute : player.mute}
            aria-label={player.muted ? 'Sound on' : 'Mute'}
          >
            {player.muted ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
          </button>
          <button type="button" className="pill ml-auto" style={{ color: ink }} onClick={value.toggleFullscreen}>
            <Minimize className="h-4 w-4" aria-hidden />
            Exit full screen
          </button>
        </div>
      </div>
    </div>
  );
}
