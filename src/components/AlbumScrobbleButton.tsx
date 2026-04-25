import { useState } from 'react';
import { ServiceButton } from './ui/service-button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip';
import { useLastFmAuth } from '../hooks/useLastFmAuth';
import { useScrobble } from '../hooks/useScrobble';
import { LastFmAuthDialog } from './LastFmAuthDialog';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { SiLastdotfm } from 'react-icons/si';
import { AlbumScrobbleRequest } from '../types/scrobble';

interface AlbumScrobbleButtonProps {
  album: AlbumScrobbleRequest;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export function AlbumScrobbleButton({
  album,
  className = '',
  fullWidth = false,
}: AlbumScrobbleButtonProps) {
  const { isAuthenticated } = useLastFmAuth();
  const { scrobbleAlbum, isScrobbling, error } = useScrobble();
  const [scrobbled, setScrobbled] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const handleScrobble = async () => {
    if (!isAuthenticated) return;

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

      if (response.success) {
        // Complete the progress animation
        setProgress({ current: 100, total: 100 });
        setTimeout(() => {
          setScrobbled(true);
          setProgress(null);
        }, 400);

        // Reset scrobbled state after 5 seconds
        setTimeout(() => setScrobbled(false), 5000);
      } else {
        setProgress(null);
      }
    } catch (err) {
      console.error('Album scrobble failed:', err);
      setProgress(null);
    }
  };

  const getIcon = () => {
    if (progress || isScrobbling) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (scrobbled) return <Check className="h-4 w-4" />;
    if (error) return <AlertCircle className="h-4 w-4 text-destructive" />;
    return <SiLastdotfm className="h-4 w-4" />;
  };

  const getButtonText = () => {
    if (progress) {
      return `Scrobbling…`;
    }
    if (isScrobbling) return 'Scrobbling…';
    if (scrobbled) return 'Album Scrobbled!';
    return 'Scrobble to Last.fm';
  };

  const getBrandColor = () => {
    if (scrobbled) {
      return '#22c55e'; // green-600
    }
    if (progress || isScrobbling) {
      return '#2563eb'; // blue-600
    }
    return '#D51007'; // Last.fm red
  };

  const getTooltipContent = () => {
    if (!isAuthenticated) return 'Connect to Last.fm to scrobble';
    if (isScrobbling) return `Scrobbling "${album.album}" by ${album.artist}…`;
    if (scrobbled) return 'Album scrobbled successfully!';
    if (error) return `Failed to scrobble: ${error}`;
    return `Scrobble "${album.album}" by ${album.artist} (${album.tracks.length} tracks)`;
  };

  const button = (
    <ServiceButton
      service="custom"
      brandColor={getBrandColor()}
      onClick={handleScrobble}
      disabled={isScrobbling || scrobbled || !!progress}
      className={`${fullWidth ? 'w-full' : ''} ${className}`}
      icon={getIcon()}
      progress={progress}
    >
      {getButtonText()}
    </ServiceButton>
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
