import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Disc } from 'lucide-react';

interface Album {
  release_name: string;
  release_artist: string;
  genre_names: string[];
  date_release_year: string;
  json_detailed_release: string;
  images_uri_release: {
    'hi-res': string;
  };
}

interface Track {
  track_number: number;
  name: string;
  duration_ms?: number;
}

interface DetailedAlbum {
  services?: {
    spotify?: {
      tracks?: Track[];
    };
  };
  labels?: string[];
  formats?: string[];
  country?: string;
}

interface AlbumModalProps {
  album: Album | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AlbumModal({ album, isOpen, onClose }: AlbumModalProps) {
  const [detailedAlbum, setDetailedAlbum] = useState<DetailedAlbum | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (album && isOpen) {
      loadDetailedAlbum(album.json_detailed_release);
    }
  }, [album, isOpen]);

  const loadDetailedAlbum = async (jsonPath: string) => {
    setLoading(true);
    try {
      const response = await fetch(jsonPath);
      const data = await response.json();
      setDetailedAlbum(data);
    } catch (error) {
      console.error('Error loading detailed album info:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!album) return null;

  const year = new Date(album.date_release_year).getFullYear();
  const tracks = detailedAlbum?.services?.spotify?.tracks || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Album Details</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Album Cover */}
          <div className="lg:col-span-1">
            <img
              src={album.images_uri_release['hi-res']}
              alt={album.release_name}
              className="w-full rounded-lg shadow-lg"
            />
          </div>

          {/* Album Info */}
          <div className="lg:col-span-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-3xl font-bold mb-2">{album.release_name}</h2>
                <p className="text-xl text-muted-foreground mb-2">{album.release_artist}</p>
                <p className="text-muted-foreground">{year}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {album.genre_names.map((genre, index) => (
                  <Badge key={index} variant="secondary" className="capitalize">
                    {genre.toLowerCase()}
                  </Badge>
                ))}
              </div>

              {detailedAlbum && (
                <div className="space-y-2 text-sm">
                  {detailedAlbum.labels && detailedAlbum.labels.length > 0 && (
                    <p><strong>Label:</strong> {detailedAlbum.labels.join(', ')}</p>
                  )}
                  {detailedAlbum.formats && detailedAlbum.formats.length > 0 && (
                    <p><strong>Format:</strong> {detailedAlbum.formats.join(', ')}</p>
                  )}
                  {detailedAlbum.country && (
                    <p><strong>Country:</strong> {detailedAlbum.country}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tracklist */}
        {tracks.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Disc className="h-5 w-5" />
              Tracklist
            </h3>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {tracks.map((track) => (
                    <div key={track.track_number} className="flex items-center justify-between p-4 hover:bg-muted/50">
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground font-mono text-sm w-8">
                          {track.track_number}
                        </span>
                        <span className="font-medium">{track.name}</span>
                      </div>
                      {track.duration_ms && (
                        <div className="flex items-center gap-1 text-muted-foreground text-sm">
                          <Clock className="h-3 w-3" />
                          {formatDuration(track.duration_ms)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}