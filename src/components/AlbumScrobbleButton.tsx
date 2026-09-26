import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip';
import { useLastFmAuth } from '../hooks/useLastFmAuth';
import { useScrobble } from '../hooks/useScrobble';
import { LastFmAuthDialog } from './LastFmAuthDialog';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { SiLastdotfm } from 'react-icons/si';
import { AlbumScrobbleRequest, AlbumScrobbleResponse } from '../types/scrobble';

interface AlbumScrobbleButtonProps {
  album: AlbumScrobbleRequest;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  fullWidth?: boolean;
  style?: React.CSSProperties;
  /** Idle label. Defaults to "Scrobble album". */
  label?: string;
  /** Solid fill colours (flood ink on flood). Omit for an outline pill. */
  tone?: { background: string; color: string };
  pillSize?: 'sm' | 'md' | 'lg';
  /** Called when a scrobble starts/finishes, so heroes can spin the record faster. */
  onActiveChange?: (active: boolean) => void;
}

export function AlbumScrobbleButton({
  album,
  className = '',
  fullWidth = false,
  label = 'Scrobble album',
  tone,
  pillSize = 'md',
  onActiveChange,
}: AlbumScrobbleButtonProps) {
  const { isAuthenticated } = useLastFmAuth();
  const { scrobbleAlbum, isScrobbling, error } = useScrobble();
  const [scrobbled, setScrobbled] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  // Last.fm accepts a scrobble request and then silently bins individual tracks (filtered
  // artist, stale timestamp). Keep the summary so a partial run is reported as one, rather
  // than looking identical to a clean success.
  const [summary, setSummary] = useState<AlbumScrobbleResponse['summary'] | null>(null);

  const handleScrobble = async () => {
    if (!isAuthenticated) return;

    onActiveChange?.(true);
    try {
      // Start with progress at 0
      setProgress({ current: 0, total: 100 });

      // Animate progress smoothly while the API call is in flight
      // Use smaller increments for smooth visual animation
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (!prev) return null;
          // Slow down as we approach 90% to wait for the API
          const increment = prev.current < 60 ? 8 : prev.current < 80 ? 4 : 1;
          const newCurrent = Math.min(prev.current + increment, 90);
          return { current: newCurrent, total: 100 };
        });
      }, 100);

      const response = await scrobbleAlbum(album);

      clearInterval(progressInterval);
      setSummary(response.summary);

      // Complete the progress animation whenever anything was scrobbled; a partial run still
      // put plays on the profile and should not read as a total failure.
      if (response.summary.successful > 0) {
        setProgress({ current: 100, total: 100 });
        setTimeout(() => {
          setScrobbled(true);
          setProgress(null);
        }, 400);

        setTimeout(() => {
          setScrobbled(false);
          setSummary(null);
        }, 8000);
      } else {
        setProgress(null);
      }
    } catch (err) {
      console.error('Album scrobble failed:', err);
      setSummary(null);
      setProgress(null);
    } finally {
      onActiveChange?.(false);
    }
  };

  const partial = !!summary && summary.successful > 0 && summary.successful < summary.total;

  const getIcon = () => {
    if (progress || isScrobbling) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (partial) return <AlertCircle className="h-4 w-4" />;
    if (scrobbled) return <Check className="h-4 w-4" />;
    if (error) return <AlertCircle className="h-4 w-4 text-destructive" />;
    return <SiLastdotfm className="h-4 w-4" />;
  };

  const getButtonText = () => {
    if (progress) {
      return `Scrobbling…`;
    }
    if (isScrobbling) return 'Scrobbling…';
    if (partial && summary) return `Scrobbled ${summary.successful} of ${summary.total}`;
    if (scrobbled) return `Scrobbled ${album.tracks.length} tracks`;
    return label;
  };

  const getTooltipContent = () => {
    if (!isAuthenticated) return 'Connect to Last.fm to scrobble';
    if (isScrobbling) return `Scrobbling "${album.album}" by ${album.artist}…`;
    if (partial && summary) {
      const missed = summary.skipped
        ? `${summary.skipped} had no track artist, so Last.fm would have filtered them`
        : `${summary.failed} were rejected by Last.fm`;
      return `Scrobbled ${summary.successful} of ${summary.total} tracks — ${missed}.`;
    }
    if (scrobbled) return 'Album scrobbled successfully!';
    if (error) return `Failed to scrobble: ${error}`;
    return `Scrobble "${album.album}" by ${album.artist} (${album.tracks.length} tracks)`;
  };

  const pct = progress ? Math.max(0, Math.min(100, (progress.current / progress.total) * 100)) : scrobbled ? 100 : 0;
  const button = (
    <button
      type="button"
      onClick={handleScrobble}
      disabled={isScrobbling || scrobbled || !!progress}
      aria-label={getTooltipContent()}
      className={`pill ${tone ? 'pill-solid' : ''} ${pillSize === 'lg' ? 'pill-lg' : pillSize === 'sm' ? 'pill-sm' : ''} ${fullWidth ? 'w-full' : ''} ${className}`}
      style={tone ? { background: tone.background, color: tone.color } : undefined}
    >
      <span className="pill-fill" style={{ width: `${pct}%` }} aria-hidden />
      <span className="pill-content">
        {getIcon()}
        {getButtonText()}
      </span>
    </button>
  );

  if (!isAuthenticated) {
    return (
      <LastFmAuthDialog>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {button}
            </TooltipTrigger>
            <TooltipContent>
              {getTooltipContent()}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </LastFmAuthDialog>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {button}
        </TooltipTrigger>
        <TooltipContent>
          {getTooltipContent()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
