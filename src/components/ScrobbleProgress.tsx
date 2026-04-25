import { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Progress } from './ui/progress';
import { useLastFmAuth } from '../hooks/useLastFmAuth';
import { useScrobble } from '../hooks/useScrobble';
import { LastFmAuthDialog } from './LastFmAuthDialog';
import { Music, Check, X, AlertCircle, Loader2 } from 'lucide-react';
import { AlbumScrobbleRequest, ScrobbleResult } from '../types/scrobble';

interface ScrobbleProgressProps {
  album: AlbumScrobbleRequest;
  children: React.ReactNode;
}

export function ScrobbleProgress({ album, children }: ScrobbleProgressProps) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTrack, setCurrentTrack] = useState<string>('');
  const [results, setResults] = useState<ScrobbleResult[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  
  const { isAuthenticated } = useLastFmAuth();
  const { scrobbleAlbum } = useScrobble();

  const handleScrobbleAlbum = async () => {
    if (!isAuthenticated) return;

    setOpen(true);
    setProgress(0);
    setResults([]);
    setIsComplete(false);
    setCurrentTrack('Starting…');

    try {
      // Since our API handles the full album scrobbling with delays,
      // we'll simulate progress updates
      const totalTracks = album.tracks.length;
      
      // Start the album scrobble
      const response = await scrobbleAlbum(album);
      
      // Update progress as tracks are processed
      album.tracks.forEach((track, index) => {
        setTimeout(() => {
          setCurrentTrack(track.title);
          setProgress(((index + 1) / totalTracks) * 100);
        }, index * 200); // Simulate processing time
      });

      // Complete after all tracks
      setTimeout(() => {
        setResults(response.results || []);
        setIsComplete(true);
        setCurrentTrack('Complete!');
        setProgress(100);
      }, totalTracks * 200);

    } catch {
      setCurrentTrack('Failed');
      setIsComplete(true);
    }
  };

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;

  if (!isAuthenticated) {
    return (
      <LastFmAuthDialog>
        {children}
      </LastFmAuthDialog>
    );
  }

  return (
    <>
      <div onClick={handleScrobbleAlbum} style={{ cursor: 'pointer' }}>
        {children}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Scrobbling Album
            </DialogTitle>
            <DialogDescription>
              Scrobbling "{album.album}" by {album.artist}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!isComplete ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{currentTrack}</span>
                </div>
                <Progress value={progress} className="w-full" />
                <div className="text-xs text-muted-foreground text-center">
                  {Math.round(progress)}% complete
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  {failureCount === 0 ? (
                    <div className="flex items-center gap-2 justify-center text-green-600">
                      <Check className="h-5 w-5" />
                      <span className="font-medium">Successfully scrobbled!</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 justify-center text-yellow-600">
                      <AlertCircle className="h-5 w-5" />
                      <span className="font-medium">Partially completed</span>
                    </div>
                  )}
                </div>

                <div className="text-sm text-center space-y-1">
                  <div>{successCount} of {results.length} tracks scrobbled</div>
                  {failureCount > 0 && (
                    <div className="text-muted-foreground">
                      {failureCount} tracks failed
                    </div>
                  )}
                </div>

                {results.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {results.map((result, index) => (
                      <div 
                        key={index}
                        className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50"
                      >
                        {result.success ? (
                          <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                        ) : (
                          <X className="h-3 w-3 text-destructive flex-shrink-0" />
                        )}
                        <span className="truncate">{result.track}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Button 
                  onClick={() => setOpen(false)}
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
