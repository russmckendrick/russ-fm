import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * A chrome-less YouTube player for /tv, on the IFrame Player API.
 *
 * It starts muted so the channel can play the moment the page opens (browsers
 * only autoplay silent video); `unmute` needs a click, which is the "Sound on"
 * button. Videos that end move on through `onEnded`; ones YouTube refuses
 * (removed, private, embedding disabled) go through `onError` so the channel
 * can skip them.
 */

interface YTPlayer {
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('YouTube player failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

export interface TvPlayer {
  ready: boolean;
  playing: boolean;
  muted: boolean;
  failed: boolean;
  load: (id: string, startSeconds?: number) => void;
  play: () => void;
  pause: () => void;
  mute: () => void;
  unmute: () => void;
  /** Seconds into the current video (0 before it starts). */
  time: () => number;
  /** The video's real length in seconds (0 until YouTube knows it). */
  duration: () => number;
  /** Jump to a point in the current video. */
  seek: (seconds: number) => void;
}

export function useTvPlayer(
  host: RefObject<HTMLDivElement | null>,
  { enabled, onEnded, onError }: { enabled: boolean; onEnded: () => void; onError: () => void },
): TvPlayer {
  const player = useRef<YTPlayer | null>(null);
  const pending = useRef<{ id: string; start: number } | null>(null);
  const handlers = useRef({ onEnded, onError });
  handlers.current = { onEnded, onError };

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  // The YouTube API only loads once the TV has been switched on.
  useEffect(() => {
    const el = host.current;
    if (!el || !enabled) return;
    let alive = true;
    // The API replaces the element it is given, so hand it a child we own.
    const mount = document.createElement('div');
    el.appendChild(mount);

    loadApi()
      .then(YT => {
        if (!alive) return;
        player.current = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (!alive) return;
              setReady(true);
              const next = pending.current;
              if (next) player.current?.loadVideoById({ videoId: next.id, startSeconds: next.start });
            },
            onStateChange: e => {
              if (e.data === PLAYING) setPlaying(true);
              else if (e.data === PAUSED) setPlaying(false);
              else if (e.data === ENDED) handlers.current.onEnded();
            },
            onError: () => handlers.current.onError(),
          },
        });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
      player.current?.destroy();
      player.current = null;
      el.replaceChildren();
      setReady(false);
    };
  }, [host, enabled]);

  const load = useCallback(
    (id: string, startSeconds = 0) => {
      const start = Math.max(0, Math.floor(startSeconds));
      pending.current = { id, start };
      if (ready) player.current?.loadVideoById({ videoId: id, startSeconds: start });
    },
    [ready],
  );

  // The YT.Player object exists before its methods do: only call it once ready.
  const api = () => (ready ? player.current : null);

  return {
    ready,
    playing,
    muted,
    failed,
    load,
    play: () => api()?.playVideo(),
    pause: () => api()?.pauseVideo(),
    mute: () => {
      api()?.mute();
      setMuted(true);
    },
    unmute: () => {
      api()?.unMute();
      api()?.playVideo();
      setMuted(false);
    },
    time: () => api()?.getCurrentTime() ?? 0,
    duration: () => api()?.getDuration() ?? 0,
    seek: (seconds: number) => api()?.seekTo(Math.max(0, seconds), true),
  };
}
