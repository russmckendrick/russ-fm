import { memo, useMemo, useState, useCallback } from 'react';
import { AlertCircle, Music } from 'lucide-react';
import { SiSpotify, SiApplemusic } from 'react-icons/si';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlayerToggle } from './PlayerToggle';
import { SpotifyEmbed } from './SpotifyEmbed';
import { AppleMusicEmbed } from './AppleMusicEmbed';
import { useMusicPlayerPreferences } from '@/hooks/useMusicPlayerPreferences';
import { cn } from '@/lib/utils';

interface DetailedAlbum {
  title: string;
  artist: string;
  services?: {
    spotify?: {
      id?: string;
      url?: string;
    };
    apple_music?: {
      url?: string;
    };
  };
}

export interface MusicPlayerSectionProps {
  album: DetailedAlbum;
  className?: string;
  showToggle?: boolean;
  defaultVisible?: boolean;
}

/**
 * Container component for music player embeds
 * Manages player visibility, service detection, and layout
 */
export const MusicPlayerSection = memo(function MusicPlayerSection({
  album,
  className,
  showToggle = true,
  defaultVisible
}: MusicPlayerSectionProps) {
  const { preferences, togglePlayers, setPreferredService } = useMusicPlayerPreferences();
  const [activeTab, setActiveTab] = useState<string>('');
  const [playerErrors, setPlayerErrors] = useState<Record<string, string>>({});

  // Determine player visibility
  const isVisible = defaultVisible !== undefined ? defaultVisible : preferences.showPlayers;

  // Extract service data
  const spotifyData = useMemo(() => {
    const spotify = album.services?.spotify;
    if (!spotify) return null;

    return {
      id: spotify.id,
      url: spotify.url,
      available: !!(spotify.id || spotify.url)
    };
  }, [album.services?.spotify]);

  const appleMusicData = useMemo(() => {
    const appleMusic = album.services?.apple_music;
    if (!appleMusic?.url) return null;

    return {
      url: appleMusic.url,
      available: true
    };
  }, [album.services?.apple_music]);

  // Determine available services (Apple Music first since it's default)
  const availableServices = useMemo(() => {
    const services: ('spotify' | 'apple_music')[] = [];
    if (appleMusicData?.available) services.push('apple_music');
    if (spotifyData?.available) services.push('spotify');
    return services;
  }, [spotifyData, appleMusicData]);

  // Set initial active tab based on preferences or availability
  useMemo(() => {
    if (availableServices.length === 0) return;

    const preferred = preferences.preferredService;
    if (preferred && availableServices.includes(preferred)) {
      setActiveTab(preferred);
    } else {
      setActiveTab(availableServices[0]);
    }
  }, [availableServices, preferences.preferredService]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    if (value === 'spotify' || value === 'apple_music') {
      setPreferredService(value);
    }
  }, [setPreferredService]);

  const handlePlayerError = useCallback((service: string, error: string) => {
    setPlayerErrors(prev => ({ ...prev, [service]: error }));
  }, []);

  const handlePlayerLoad = useCallback((service: string) => {
    setPlayerErrors(prev => {
      const updated = { ...prev };
      delete updated[service];
      return updated;
    });
  }, []);

  // Don't render if no services are available
  if (availableServices.length === 0) {
    return null;
  }

  // Don't render content if not visible (but keep toggle if enabled)
  if (!isVisible && showToggle) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Music className="h-5 w-5" />
              Music Players
            </CardTitle>
            <PlayerToggle
              isVisible={isVisible}
              onToggle={togglePlayers}
              availableServices={availableServices}
              compact
            />
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        {isVisible && (
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <div className="flex items-center gap-3 mb-4">
              <TabsList className="flex-1">
                {availableServices.includes('apple_music') && (
                  <TabsTrigger value="apple_music" className="flex-1 gap-2">
                    <SiApplemusic className="h-4 w-4 text-red-500" />
                    Apple Music
                  </TabsTrigger>
                )}
                {availableServices.includes('spotify') && (
                  <TabsTrigger value="spotify" className="flex-1 gap-2">
                    <SiSpotify className="h-4 w-4 text-green-500" />
                    Spotify
                  </TabsTrigger>
                )}
              </TabsList>
              {showToggle && (
                <PlayerToggle
                  isVisible={isVisible}
                  onToggle={togglePlayers}
                  availableServices={availableServices}
                  compact
                />
              )}
            </div>

            {availableServices.includes('apple_music') && appleMusicData && (
              <TabsContent value="apple_music" className="mt-0">
                <AppleMusicEmbed
                  albumUrl={appleMusicData.url}
                  albumTitle={album.title}
                  artistName={album.artist}
                  onError={(error) => handlePlayerError('apple_music', error)}
                  onLoad={() => handlePlayerLoad('apple_music')}
                />
              </TabsContent>
            )}

            {availableServices.includes('spotify') && spotifyData && (
              <TabsContent value="spotify" className="mt-0">
                <SpotifyEmbed
                  albumId={spotifyData.id}
                  albumUrl={spotifyData.url}
                  albumTitle={album.title}
                  artistName={album.artist}
                  autoplay={preferences.autoplay}
                  onError={(error) => handlePlayerError('spotify', error)}
                  onLoad={() => handlePlayerLoad('spotify')}
                />
              </TabsContent>
            )}
          </Tabs>
        )}

        {Object.keys(playerErrors).length === availableServices.length && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Unable to load music players. You can still access this album through the service buttons above.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
});

/**
 * Minimal player section without card wrapper
 * Useful for embedding in existing layouts
 */
export const MusicPlayerSectionMinimal = memo(function MusicPlayerSectionMinimal({
  album,
  className
}: Omit<MusicPlayerSectionProps, 'showToggle' | 'defaultVisible'>) {
  const { preferences } = useMusicPlayerPreferences();

  // Extract service data
  const spotifyData = album.services?.spotify;
  const appleMusicData = album.services?.apple_music;

  const hasSpotify = !!(spotifyData?.id || spotifyData?.url);
  const hasAppleMusic = !!appleMusicData?.url;

  if (!hasSpotify && !hasAppleMusic) {
    return null;
  }

  if (!preferences.showPlayers) {
    return null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {hasAppleMusic && appleMusicData && (
        <AppleMusicEmbed
          albumUrl={appleMusicData.url}
          albumTitle={album.title}
          artistName={album.artist}
        />
      )}

      {hasSpotify && spotifyData && (
        <SpotifyEmbed
          albumId={spotifyData.id}
          albumUrl={spotifyData.url}
          albumTitle={album.title}
          artistName={album.artist}
          autoplay={preferences.autoplay}
        />
      )}
    </div>
  );
});