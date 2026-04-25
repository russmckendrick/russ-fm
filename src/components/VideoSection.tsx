import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Play } from 'lucide-react';

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:v=|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

interface VideoSectionProps {
  videos: string[];
  className?: string;
}

export const VideoSection = memo(function VideoSection({ videos, className }: VideoSectionProps) {
  const [playing, setPlaying] = useState(false);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const validVideos = videos
    .map((url) => ({ url, id: extractYouTubeId(url) }))
    .filter((v): v is { url: string; id: string } => v.id !== null);

  // Fetch video titles via YouTube oEmbed (no API key needed)
  useEffect(() => {
    validVideos.forEach(({ id, url }) => {
      if (titles[id]) return;
      fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.title) {
            setTitles((prev) => ({ ...prev, [id]: data.title }));
          }
        })
        .catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  // Listen for YouTube iframe API postMessage events to detect video end
  const handleMessage = useCallback((e: MessageEvent) => {
    if (e.origin !== 'https://www.youtube.com') return;
    try {
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      // YouTube iframe API sends state 0 when video ends
      if (data?.event === 'onStateChange' && data?.info === 0) {
        setFeaturedIndex((prev) => {
          const next = (prev + 1) % validVideos.length;
          return next;
        });
        // Keep playing — the next video will autoplay
      }
    } catch {
      // ignore non-JSON messages
    }
  }, [validVideos.length]);

  useEffect(() => {
    if (!playing) return;
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [playing, handleMessage]);

  if (validVideos.length === 0) return null;

  const featured = validVideos[featuredIndex];
  const gridVideos = validVideos.filter((_, i) => i !== featuredIndex);

  const handlePlay = () => {
    setPlaying(true);
  };

  const handleGridClick = (originalIndex: number) => {
    setFeaturedIndex(originalIndex);
    setPlaying(true);
  };

  return (
    <div className={className ?? ''}>
      {/* Featured hero video */}
      <div>
        <div className="relative aspect-video overflow-hidden border border-rule-strong bg-stage">
          {playing ? (
            <iframe
              ref={iframeRef}
              src={`https://www.youtube.com/embed/${featured.id}?autoplay=1&enablejsapi=1`}
              title={titles[featured.id] || 'YouTube video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          ) : (
            <button
              type="button"
              onClick={handlePlay}
              className="group absolute inset-0 w-full h-full cursor-pointer"
            >
              <img
                src={`https://img.youtube.com/vi/${featured.id}/maxresdefault.jpg`}
                alt={titles[featured.id] || 'Video thumbnail'}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-[rgba(8,8,7,0.35)] transition-colors group-hover:bg-[rgba(8,8,7,0.48)]">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-hl shadow-lg transition-transform group-hover:scale-110">
                  <Play className="ml-0.5 h-10 w-10 fill-paper text-paper" />
                </div>
              </div>
            </button>
          )}
        </div>
        {titles[featured.id] && (
          <p className="mt-2 text-base font-medium text-foreground truncate">{titles[featured.id]}</p>
        )}
      </div>

      {/* Remaining videos grid */}
      {gridVideos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {gridVideos.map(({ id }) => {
            const originalIndex = validVideos.findIndex((v) => v.id === id);
            return (
              <div key={id} className="group">
                <div className="relative aspect-video overflow-hidden border border-rule-strong bg-stage">
                  <button
                    type="button"
                    onClick={() => handleGridClick(originalIndex)}
                    className="group/btn absolute inset-0 w-full h-full cursor-pointer"
                  >
                    <img
                      src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
                      alt={titles[id] || 'Video thumbnail'}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover/btn:scale-105"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-[rgba(8,8,7,0.35)] transition-colors group-hover/btn:bg-[rgba(8,8,7,0.48)]">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-hl shadow-lg transition-transform group-hover/btn:scale-110">
                        <Play className="ml-0.5 h-8 w-8 fill-paper text-paper" />
                      </div>
                    </div>
                  </button>
                </div>
                {titles[id] && (
                  <p className="mt-2 text-sm font-medium text-foreground truncate">{titles[id]}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
