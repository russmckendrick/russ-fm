import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Play } from 'lucide-react';
import { SiYoutube } from 'react-icons/si';
import { cn } from '@/lib/utils';
import { youTubeVideos } from '@/lib/youtube';

// Titles come from YouTube oEmbed (no key needed). Cached for the tab so
// switching albums and back doesn't refetch.
const titleCache = new Map<string, Promise<string | null>>();

function fetchTitle(url: string): Promise<string | null> {
  let pending = titleCache.get(url);
  if (!pending) {
    pending = fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => (typeof data?.title === 'string' ? data.title : null))
      .catch(() => null);
    titleCache.set(url, pending);
  }
  return pending;
}

interface YouTubeEmbedProps {
  videos: string[];
  /** Matches the Apple Music embed so the Listen tabs don't jump. */
  height?: number;
  className?: string;
}

/**
 * The Videos tab in Listen: a player sized like the Apple Music and Spotify
 * embeds, with the video on the left and a numbered list on the right.
 * Nothing loads from YouTube until a video is played (just thumbnails), and
 * a row's title is fetched when it scrolls into the list's view, so an album
 * with hundreds of videos stays cheap.
 */
export const YouTubeEmbed = memo(function YouTubeEmbed({ videos, height = 450, className }: YouTubeEmbedProps) {
  const list = useMemo(() => youTubeVideos(videos), [videos]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const loadTitle = useCallback((url: string, id: string) => {
    fetchTitle(url).then(title => {
      if (title) setTitles(prev => (prev[id] ? prev : { ...prev, [id]: title }));
    });
  }, []);

  // Advance to the next video when one ends. The player only reports state
  // changes after we tell it we're listening (see onLoad below).
  useEffect(() => {
    if (!playing) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com' || e.source !== iframeRef.current?.contentWindow) return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        const state = data?.event === 'onStateChange' ? data.info : data?.info?.playerState;
        if (state === 0) setCurrent(i => (i + 1) % list.length);
      } catch {
        // not a player message
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [playing, list.length]);

  const video = list[current];
  if (!video) return null;
  const title = titles[video.id];

  const play = (i: number) => {
    setCurrent(i);
    setPlaying(true);
  };

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-[12px] bg-[#1d1d1f] text-[#f1f1f1] md:grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]',
        className,
      )}
      style={{ '--yt-h': `${height}px` } as React.CSSProperties}
    >
      {/* Player ------------------------------------------------------- */}
      <div className="flex min-w-0 flex-col gap-4 p-5 md:h-[var(--yt-h)] md:p-6">
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 self-start text-[15px] font-bold tracking-[-0.01em]"
          aria-label="Open on YouTube"
        >
          <SiYoutube className="h-6 w-6 text-[#ff0033]" aria-hidden />
          YouTube
        </a>
        <div className="relative aspect-video w-full overflow-hidden rounded-[8px] bg-black">
          {playing ? (
            <iframe
              key={video.id}
              ref={iframeRef}
              src={`https://www.youtube.com/embed/${video.id}?autoplay=1&enablejsapi=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`}
              title={title || 'YouTube video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
              onLoad={() => {
                const win = iframeRef.current?.contentWindow;
                win?.postMessage(JSON.stringify({ event: 'listening', id: 1 }), 'https://www.youtube.com');
                win?.postMessage(
                  JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }),
                  'https://www.youtube.com',
                );
              }}
            />
          ) : (
            <button type="button" onClick={() => play(current)} className="group absolute inset-0" aria-label={`Play ${title || 'video'}`}>
              <img
                src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
                alt=""
                className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
              />
              <span className="absolute left-1/2 top-1/2 flex h-14 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[14px] bg-[#ff0033] shadow-lg transition-transform group-hover:scale-105">
                <Play className="h-7 w-7 fill-white text-white" aria-hidden />
              </span>
            </button>
          )}
        </div>
        <div className="flex min-w-0 items-start justify-between gap-4">
          <p className="m-0 line-clamp-2 text-[16px] font-semibold leading-snug">{title || `Video ${current + 1}`}</p>
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-[#ff4e6a] hover:text-[#ff7a8e]"
          >
            Watch on YouTube
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>

      {/* List --------------------------------------------------------- */}
      <div className="flex min-h-0 flex-col border-t border-white/10 bg-[#2a2a2c] md:h-[var(--yt-h)] md:border-l md:border-t-0">
        <div className="flex items-baseline justify-between px-5 pb-2 pt-5 md:px-6">
          <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-white/60">Videos</span>
          <span className="text-[13px] tabular-nums text-white/60">{list.length}</span>
        </div>
        <ol ref={listRef} className="m-0 min-h-0 flex-1 list-none overflow-y-auto px-2 pb-3 max-md:max-h-[300px] md:px-3">
          {list.map((v, i) => (
            <VideoRow
              key={v.id}
              index={i}
              id={v.id}
              url={v.url}
              title={titles[v.id]}
              active={i === current}
              playing={playing && i === current}
              root={listRef}
              onVisible={loadTitle}
              onPick={play}
            />
          ))}
        </ol>
      </div>
    </div>
  );
});

interface VideoRowProps {
  index: number;
  id: string;
  url: string;
  title?: string;
  active: boolean;
  playing: boolean;
  root: React.RefObject<HTMLOListElement | null>;
  onVisible: (url: string, id: string) => void;
  onPick: (index: number) => void;
}

function VideoRow({ index, id, url, title, active, playing, root, onVisible, onPick }: VideoRowProps) {
  const ref = useRef<HTMLLIElement>(null);

  // Fetch the title once the row is (nearly) on screen in the list.
  useEffect(() => {
    const el = ref.current;
    if (!el || title) return;
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          onVisible(url, id);
          io.disconnect();
        }
      },
      { root: root.current, rootMargin: '120px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id, url, title, root, onVisible]);

  return (
    <li ref={ref}>
      <button
        type="button"
        onClick={() => onPick(index)}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left transition-colors hover:bg-white/10',
          active && 'bg-white/10',
        )}
      >
        <span className={cn('w-6 shrink-0 text-right text-[14px] tabular-nums', active ? 'text-[#ff4e6a]' : 'text-white/50')}>
          {playing ? '▶' : index + 1}
        </span>
        <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" className="aspect-video w-[72px] shrink-0 rounded-[4px] bg-black object-cover" />
        <span className={cn('line-clamp-2 min-w-0 flex-1 text-[14px] leading-snug', active ? 'font-semibold text-white' : 'text-white/85')}>
          {title || `Video ${index + 1}`}
        </span>
      </button>
    </li>
  );
}
