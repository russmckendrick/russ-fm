import { useState, useEffect, useRef, memo } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { 
  extractSpotifyAlbumId, 
  buildSpotifyEmbedUrl, 
  MusicServiceError 
} from '@/lib/musicServiceUtils';

export interface SpotifyEmbedProps {
  albumId?: string;
  albumUrl?: string;
  albumTitle: string;
  artistName: string;
  onError?: (error: string) => void;
  onLoad?: () => void;
  className?: string;
  height?: number;
  autoplay?: boolean;
}

interface EmbedState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error?: string;
  retryCount: number;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

/**
 * Spotify album embed component with error handling and retry logic
 */
export const SpotifyEmbed = memo(function SpotifyEmbed({
  albumId,
  albumUrl,
  albumTitle,
  artistName,
  onError,
  onLoad,
  className,
  height = 352,
  autoplay = false
}: SpotifyEmbedProps) {
  const [state, setState] = useState<EmbedState>({
    status: 'idle',
    retryCount: 0
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);

  // Extract album ID from URL or use provided ID
  const spotifyAlbumId = (() => {
    try {
      if (albumId) {
        return extractSpotifyAlbumId(albumId);
      }
      if (albumUrl) {
        return extractSpotifyAlbumId(albumUrl);
      }
      return null;
    } catch (error) {
      if (error instanceof MusicServiceError) {
        return null;
      }
      throw error;
    }
  })();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!spotifyAlbumId) {
      setState({
        status: 'error',
        error: 'No valid Spotify album ID or URL provided',
        retryCount: 0
      });
      onError?.('No valid Spotify album ID or URL provided');
    }
  }, [spotifyAlbumId, onError]);

  const handleLoad = () => {
    if (!mountedRef.current) return;
    
    setState(prev => ({ ...prev, status: 'loaded' }));
    onLoad?.();
  };

  const handleError = () => {
    if (!mountedRef.current) return;
    
    if (state.retryCount < MAX_RETRY_ATTEMPTS) {
      timeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setState(prev => ({
            ...prev,
            status: 'loading',
            retryCount: prev.retryCount + 1
          }));
        }
      }, RETRY_DELAY * (state.retryCount + 1));
    } else {
      const errorMsg = `Failed to load Spotify player after ${MAX_RETRY_ATTEMPTS} attempts`;
      setState({
        status: 'error',
        error: errorMsg,
        retryCount: state.retryCount
      });
      onError?.(errorMsg);
    }
  };

  const retry = () => {
    setState({
      status: 'loading',
      retryCount: 0
    });
  };

  if (!spotifyAlbumId) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Spotify player unavailable</AlertTitle>
        <AlertDescription>
          This album cannot be played because no valid Spotify ID was found.
        </AlertDescription>
      </Alert>
    );
  }

  if (state.status === 'error') {
    return (
      <Alert className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unable to load Spotify player</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>The player for "{albumTitle}" by {artistName} could not be loaded.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={retry}
            className="gap-2"
          >
            <RefreshCw className="h-3 w-3" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const embedUrl = buildSpotifyEmbedUrl(spotifyAlbumId, {
    // The site is dark-ground only, so the players always use their dark theme.
    theme: 'dark',
    height
  });

  const iframeSrc = autoplay 
    ? `${embedUrl}${embedUrl.includes('?') ? '&' : '?'}autoplay=1`
    : embedUrl;

  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg', className)}>
      {state.status === 'loading' && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-background/80 z-10"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm text-muted-foreground">
              Loading Spotify player...
              {state.retryCount > 0 && ` (Retry ${state.retryCount}/${MAX_RETRY_ATTEMPTS})`}
            </span>
          </div>
        </div>
      )}
      
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        width="100%"
        height={height}
        frameBorder="0"
        allowTransparency
        allow="encrypted-media; autoplay; clipboard-write; fullscreen; picture-in-picture"
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
        title={`Spotify player for ${albumTitle} by ${artistName}`}
        className={cn(
          'w-full transition-opacity duration-300',
          state.status === 'loading' ? 'opacity-0' : 'opacity-100'
        )}
      />
    </div>
  );
});

/**
 * Compact version of SpotifyEmbed for smaller layouts
 */
export const SpotifyEmbedCompact = memo(function SpotifyEmbedCompact(
  props: Omit<SpotifyEmbedProps, 'height'>
) {
  return <SpotifyEmbed {...props} height={152} />;
});