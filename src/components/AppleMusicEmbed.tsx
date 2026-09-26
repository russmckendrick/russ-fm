import { useState, useEffect, useRef, memo } from 'react';
import { Loader2, AlertCircle, RefreshCw, Music2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { 
  parseAppleMusicUrl,
  buildAppleMusicEmbedUrl, 
  MusicServiceError 
} from '@/lib/musicServiceUtils';

export interface AppleMusicEmbedProps {
  albumUrl: string;
  albumTitle: string;
  artistName: string;
  onError?: (error: string) => void;
  onLoad?: () => void;
  className?: string;
  height?: number;
  country?: string;
}

interface EmbedState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error?: string;
  retryCount: number;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

/**
 * Apple Music album embed component with error handling and retry logic
 */
export const AppleMusicEmbed = memo(function AppleMusicEmbed({
  albumUrl,
  albumTitle,
  artistName,
  onError,
  onLoad,
  className,
  height = 450,
  country: defaultCountry = 'us'
}: AppleMusicEmbedProps) {
  const [state, setState] = useState<EmbedState>({
    status: 'idle',
    retryCount: 0
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);

  // Parse Apple Music URL to extract album ID and country
  const parsedData = (() => {
    try {
      return parseAppleMusicUrl(albumUrl);
    } catch (error) {
      if (error instanceof MusicServiceError) {
        return null;
      }
      throw error;
    }
  })();

  const albumId = parsedData?.id;
  const country = parsedData?.country || defaultCountry;

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
    if (!albumId) {
      setState({
        status: 'error',
        error: 'Invalid Apple Music URL provided',
        retryCount: 0
      });
      onError?.('Invalid Apple Music URL provided');
    } else {
      setState({
        status: 'loading',
        retryCount: 0
      });
      
      // Set a timeout to remove loading state even if onLoad doesn't fire
      const loadTimeout = setTimeout(() => {
        if (mountedRef.current) {
          setState(prev => prev.status === 'loading' ? { ...prev, status: 'loaded' } : prev);
        }
      }, 1500); // 1.5 second timeout
      
      return () => clearTimeout(loadTimeout);
    }
  }, [albumId, onError]);

  const handleLoad = () => {
    if (!mountedRef.current) return;
    
    // Slight delay to ensure the iframe content is actually loaded
    setTimeout(() => {
      if (mountedRef.current) {
        setState(prev => ({ ...prev, status: 'loaded' }));
        onLoad?.();
      }
    }, 200);
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
      const errorMsg = `Failed to load Apple Music player after ${MAX_RETRY_ATTEMPTS} attempts`;
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

  if (!albumId) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Apple Music player unavailable</AlertTitle>
        <AlertDescription>
          This album cannot be played because the Apple Music URL is invalid.
        </AlertDescription>
      </Alert>
    );
  }

  if (state.status === 'error') {
    return (
      <Alert className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Apple Music player unavailable</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>Apple Music embeds may not be supported in this browser or region.</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={retry}
              className="gap-2"
            >
              <RefreshCw className="h-3 w-3" />
              Try again
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a 
                href={albumUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="gap-2"
              >
                <Music2 className="h-3 w-3" />
                Open in Apple Music
              </a>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const embedUrl = buildAppleMusicEmbedUrl(albumId, country, { 
    height, 
    // The site is dark-ground only, so the players always use their dark theme.
    theme: 'dark'
  });

  return (
    <div 
      className={cn('relative w-full overflow-hidden rounded-lg', className)}
      style={{
        left: 0,
        width: '100%',
        height: `${height}px`,
        position: 'relative'
      }}
    >
      {state.status === 'loading' && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-background/80 z-10"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm text-muted-foreground">
              Loading Apple Music player...
              {state.retryCount > 0 && ` (Retry ${state.retryCount}/${MAX_RETRY_ATTEMPTS})`}
            </span>
          </div>
        </div>
      )}
      
      <iframe
        ref={iframeRef}
        id="embedPlayer"
        src={embedUrl}
        width="100%"
        height={height}
        frameBorder="2"
        allowFullScreen
        allow="autoplay *; encrypted-media *; clipboard-write"
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
        loading="eager"
        onLoad={handleLoad}
        onError={handleError}
        title={`Apple Music player for ${albumTitle} by ${artistName}`}
        className={cn(
          'w-full transition-opacity duration-300',
          state.status === 'loading' ? 'opacity-0' : 'opacity-100'
        )}
        style={{
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          position: 'absolute',
          border: 0,
          overflow: 'hidden',
          borderRadius: '10px',
          transform: 'translateZ(0px)',
          backgroundColor: 'rgb(228, 228, 228)'
        }}
      />
    </div>
  );
});

/**
 * Compact version of AppleMusicEmbed for smaller layouts
 */
export const AppleMusicEmbedCompact = memo(function AppleMusicEmbedCompact(
  props: Omit<AppleMusicEmbedProps, 'height'>
) {
  return <AppleMusicEmbed {...props} height={175} />;
});