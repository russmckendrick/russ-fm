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
  variant = 'outline',
  size = 'default',
  className = '',
  fullWidth = false,
  style
}: AlbumScrobbleButtonProps) {
  const { isAuthenticated } = useLastFmAuth();
  const { scrobbleAlbum, isScrobbling, error } = useScrobble();
  const [scrobbled, setScrobbled] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const handleScrobble = async () => {
    if (!isAuthenticated) return;

    try {
      setProgress({ current: 0, total: album.tracks.length });

      // Simulate progress updates during scrobbling
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (!prev) return null;
          const newCurrent = Math.min(prev.current + 1, prev.total);
          return { current: newCurrent, total: prev.total };
        });
      }, 3000); // Update every 3 seconds (Last.fm scrobbling interval)

      const response = await scrobbleAlbum(album);

      clearInterval(progressInterval);

      if (response.success) {
        setProgress({ current: album.tracks.length, total: album.tracks.length });
        setTimeout(() => {
          setScrobbled(true);
          setProgress(null);
        }, 500);

        // Reset scrobbled state after 5 seconds
        setTimeout(() => setScrobbled(false), 5000);
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
      return `Scrobbling ${progress.current}/${progress.total}...`;
    }
    if (isScrobbling) return 'Scrobbling...';
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
    if (isScrobbling) return `Scrobbling "${album.album}" by ${album.artist}...`;
    if (scrobbled) return 'Album scrobbled successfully!';
    if (error) return `Failed to scrobble: ${error}`;
    return `Scrobble "${album.album}" by ${album.artist} (${album.tracks.length} tracks)`;
  };

  const button = (
    <div className="space-y-2">
      <ServiceButton
        service="custom"
        brandColor={getBrandColor()}
        onClick={handleScrobble}
        disabled={isScrobbling || scrobbled || !!progress}
        className={`${fullWidth ? 'w-full' : ''} ${className}`}
        icon={getIcon()}
      >
        {getButtonText()}
      </ServiceButton>

      {/* Progress bar */}
      {progress && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${(progress.current / progress.total) * 100}%`
            }}
          ></div>
        </div>
      )}
    </div>
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