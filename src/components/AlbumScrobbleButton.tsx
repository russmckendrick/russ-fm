import { useEffect, useRef, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip';
import { useLastFmAuth } from '../hooks/useLastFmAuth';
import { useScrobble } from '../hooks/useScrobble';
import { LastFmAuthDialog } from './LastFmAuthDialog';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { SiLastdotfm } from 'react-icons/si';
import { AlbumScrobbleRequest, AlbumScrobbleResponse } from '../types/scrobble';
import type { ScrobbleProgress } from '../hooks/useScrobbleScene';

interface AlbumScrobbleButtonProps {
  album: AlbumScrobbleRequest;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  fullWidth?: boolean;
  style?: React.CSSProperties;
  /** Idle label. Defaults to "Scrobble album". */
  label?: string;
  /** Shorter idle label for phones (below `sm`). */
  mobileLabel?: string;
  /** Solid fill colours (flood ink on flood). Omit for an outline pill. */
  tone?: { background: string; color: string };
  pillSize?: 'sm' | 'md' | 'lg';
  /** Called when a scrobble starts/finishes, so heroes can spin the record faster. */
  onActiveChange?: (active: boolean) => void;
  /** Track-by-track progress, for heroes that animate the scrobble. */
  onProgress?: (progress: ScrobbleProgress) => void;
  /** Wait this long before the first track starts ticking (lets a hero animation play in). */
  leadInMs?: number;
  /** How long each track holds before the next one ticks. */
  trackMs?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * In dev the button is a dry run: no Last.fm login needed and nothing is sent. It waits
 * as long as a real request and reports every track as scrobbled, so the hero scene runs.
 */
const DRY_RUN = import.meta.env.DEV;

async function dryRunScrobble(album: AlbumScrobbleRequest): Promise<AlbumScrobbleResponse> {
  await new Promise(resolve => setTimeout(resolve, 1200));
  const total = album.tracks.length;
  return {
    success: true,
    message: 'Dry run: nothing sent to Last.fm',
    results: album.tracks.map(track => ({ track: track.title, success: true })),
    summary: { total, successful: total, failed: 0, skipped: 0 },
  };
}

export function AlbumScrobbleButton({
  album,
  className = '',
  fullWidth = false,
  label = 'Scrobble album',
  mobileLabel,
  tone,
  pillSize = 'md',
  onActiveChange,
  onProgress,
  leadInMs = 0,
  trackMs = 460,
}: AlbumScrobbleButtonProps) {
  const { isAuthenticated: loggedIn } = useLastFmAuth();
  const isAuthenticated = loggedIn || DRY_RUN;
  const { scrobbleAlbum, isScrobbling, error } = useScrobble();
  const [scrobbled, setScrobbled] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Last.fm accepts a scrobble request and then silently bins individual tracks (filtered
  // artist, stale timestamp). Keep the summary so a partial run is reported as one, rather
  // than looking identical to a clean success.
  const [summary, setSummary] = useState<AlbumScrobbleResponse['summary'] | null>(null);
  const mounted = useRef(true);
  const tickTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(tickTimer.current);
    };
  }, []);

  const handleScrobble = async () => {
    if (!isAuthenticated) return;

    const total = album.tracks.length;
    let done = 0;
    let answered = false;
    let ticksFinished: () => void = () => {};
    const allTicked = new Promise<void>(resolve => (ticksFinished = resolve));
    const report = (status: ScrobbleProgress['status'], successful?: number) => {
      if (mounted.current) onProgress?.({ status, done, total, successful });
    };

    // Tick through the tracks at a steady pace while the request is in flight, holding on
    // the last one until Last.fm answers, so the count never runs ahead of the real result.
    const step = () => {
      if (!mounted.current) return;
      if (done >= total - 1 && !answered) {
        tickTimer.current = window.setTimeout(step, 120);
        return;
      }
      done += 1;
      setProgress({ done, total });
      if (done >= total) {
        ticksFinished();
        return;
      }
      report('running');
      tickTimer.current = window.setTimeout(step, trackMs);
    };

    onActiveChange?.(true);
    setProgress({ done: 0, total });
    report('running');
    tickTimer.current = window.setTimeout(step, leadInMs + trackMs);

    try {
      const response = DRY_RUN ? await dryRunScrobble(album) : await scrobbleAlbum(album);
      setSummary(response.summary);

      // Finish the count whenever anything was scrobbled; a partial run still put plays on
      // the profile and should not read as a total failure.
      if (response.summary.successful > 0) {
        answered = true;
        await allTicked;
        if (!mounted.current) return;
        setScrobbled(true);
        setProgress(null);
        report('done', response.summary.successful);

        setTimeout(() => {
          if (!mounted.current) return;
          setScrobbled(false);
          setSummary(null);
        }, 8000);
      } else {
        clearTimeout(tickTimer.current);
        setProgress(null);
        report('failed');
      }
    } catch (err) {
      console.error('Album scrobble failed:', err);
      clearTimeout(tickTimer.current);
      setSummary(null);
      setProgress(null);
      report('failed');
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
      const count = `${pad(Math.min(progress.done + 1, progress.total))} / ${pad(progress.total)}`;
      if (!mobileLabel) return `Scrobbling ${count}`;
      // Phones keep the pill short so the icon pills beside it stay on one row.
      return (
        <>
          <span className="max-sm:hidden">Scrobbling {count}</span>
          <span className="sm:hidden">{count}</span>
        </>
      );
    }
    if (isScrobbling) return 'Scrobbling…';
    if (partial && summary) return `Scrobbled ${summary.successful} of ${summary.total}`;
    if (scrobbled) return `Scrobbled ${album.tracks.length} tracks`;
    if (!mobileLabel) return label;
    return (
      <>
        <span className="max-sm:hidden">{label}</span>
        <span className="sm:hidden">{mobileLabel}</span>
      </>
    );
  };

  const getTooltipContent = () => {
    if (!isAuthenticated) return 'Connect to Last.fm to scrobble';
    if (DRY_RUN && !progress && !scrobbled) return `Dev dry run: plays the scrobble without sending anything to Last.fm`;
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

  const pct = progress ? Math.max(0, Math.min(100, (progress.done / Math.max(progress.total, 1)) * 100)) : scrobbled ? 100 : 0;
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
