import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ListMusic } from 'lucide-react';
import Barcode from 'react-barcode';
import { SiSpotify, SiDiscogs, SiApplemusic } from 'react-icons/si';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { filterGenres } from '@/lib/filterGenres';
import { getCleanGenres } from '@/lib/genreUtils';
import { getGenreColor, getGenreTextColor } from '@/lib/genreColors';
import { MusicPlayerSection } from '@/components/MusicPlayerSection';
import { AlbumScrobbleButton } from '@/components/AlbumScrobbleButton';
import { getAlbumImageFromData, getArtistImageFromData, getAlbumOGImageUrl, handleImageError } from '@/lib/image-utils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { useAlbumColorsWithFallback } from '@/hooks/useAlbumColors';
import { getEnhancedTextColor, generateColorProperties, createHeroBackground, createGlowGradient } from '@/lib/color-utils';
import { appConfig } from '@/config/app.config';

interface Album {
  release_name: string;
  release_artist: string;
  artists?: Array<{
    name: string;
    uri_artist: string;
    json_detailed_artist: string;
    images_uri_artist: {
      'hi-res': string;
      medium: string;
    };
  }>;
  genre_names: string[];
  uri_release: string;
  uri_artist: string;
  date_added: string;
  date_release_year: string;
  json_detailed_release: string;
  json_detailed_artist: string;
  images_uri_release: {
    'hi-res': string;
    medium: string;
  };
  images_uri_artist: {
    'hi-res': string;
    medium: string;
  };
}

interface Track {
  track_number: number;
  name: string;
  duration_ms?: number;
  position?: string;
  artists?: Array<{
    name: string;
    discogs_id?: string;
    spotify_id?: string;
  }>;
}

interface DetailedAlbum {
  id?: string;
  title: string;
  artist: string; // Added for MusicPlayerSection compatibility
  artists: Array<{
    name: string;
    biography?: string;
  }>;
  released: string;
  year: number;
  country?: string;
  labels?: string[];
  formats?: string[];
  genres: string[];
  styles?: string[];
  tracklist?: Track[];
  images?: Array<{
    type: string;
    uri: string;
    uri150: string;
    uri500: string;
    width: number;
    height: number;
  }>;
  spotify_id?: string;
  spotify_url?: string;
  discogs_id?: string;
  discogs_url?: string;
  services?: {
    spotify?: {
      genres?: string[];
      id?: string;
      url?: string;
      tracks?: Track[];
      popularity?: number;
      external_ids?: {
        upc?: string;
      };
      copyrights?: Array<{
        text: string;
        type: string;
      }>;
      raw_data?: {
        external_urls?: {
          spotify?: string;
        };
        tracks?: {
          items?: Array<{
            track_number?: number;
            name: string;
            duration_ms?: number;
            disc_number?: number;
          }>;
        };
      };
    };
    apple_music?: {
      url?: string;
      editorial_notes?: string;
      copyright?: string;
      artwork_url?: string;
      raw_attributes?: {
        genreNames?: string[];
        editorialNotes?: {
          short?: string;
          standard?: string;
        };
      };
    };
    lastfm?: {
      listeners?: number;
      playcount?: number;
      wiki_content?: string;
      wiki_summary?: string;
      url?: string;
      raw_data?: {
        album?: {
          tracks?: {
            track?: Track | Track[]; // Can be array or single track
          };
        };
      };
    };
    discogs?: {
      id?: string;
      url?: string;
    };
  };
  local_images: {
    'hi-res': string;
    medium: string;
  };
}

export function AlbumDetailPage() {
  const { albumPath } = useParams<{ albumPath: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<Album | null>(null);
  const [detailedAlbum, setDetailedAlbum] = useState<DetailedAlbum | null>(null);
  const [loading, setLoading] = useState(true);

  // Load album colors using the album path
  const albumColors = useAlbumColorsWithFallback(albumPath);

  // Check if URL needs sanitization and redirect if necessary
  useEffect(() => {
    const checkAndRedirectAlbumPath = async () => {
      if (albumPath) {
        // Case 1: Pure Discogs ID (like "25472284")
        if (/^\d+$/.test(albumPath)) {
          try {
            // Load collection to find the album with this Discogs ID
            const collectionResponse = await fetch('/collection.json');
            const collection = await collectionResponse.json();

            // Find album by Discogs ID
            const foundAlbum = collection.find((album: any) => {
              const albumDiscogsId = album.uri_release.match(/\/(\d+)\//)?.[1];
              return albumDiscogsId === albumPath;
            });

            if (foundAlbum) {
              // Use the hi-res image path to get the actual folder structure
              // The hi-res image path contains the correct sanitized folder name
              const hiResPath = foundAlbum.images_uri_release['hi-res'];
              if (hiResPath) {
                // Extract album path from: "/album/unknown-25472284/unknown-25472284-hi-res.jpg"
                const albumPathMatch = hiResPath.match(/\/album\/([^\/]+)\//);
                if (albumPathMatch) {
                  const correctPath = albumPathMatch[1];
                  navigate(`/album/${correctPath}`, { replace: true });
                  return;
                }
              }

              // Fallback: try to construct from release name + ID
              const albumNamePart = sanitizeFolderName(foundAlbum.release_name);
              const correctPath = `${albumNamePart}-${albumPath}`;
              navigate(`/album/${correctPath}`, { replace: true });
              return;
            }
          } catch (error) {
            console.error('Error loading collection for album redirect:', error);
          }
        }

        // Case 2: Album name with Discogs ID (format: "album-name-discogsid")
        const pathMatch = albumPath.match(/^(.+)-(\d+)$/);
        if (pathMatch) {
          const [, albumNamePart, discogsId] = pathMatch;
          const sanitizedAlbumName = sanitizeFolderName(albumNamePart);
          const expectedPath = `${sanitizedAlbumName}-${discogsId}`;

          // If the current path doesn't match the sanitized path, redirect
          if (albumPath !== expectedPath) {
            navigate(`/album/${expectedPath}`, { replace: true });
            return;
          }
        }
      }
    };

    checkAndRedirectAlbumPath();
  }, [albumPath, navigate]);

  // Set page title based on album data
  const pageTitle = detailedAlbum
    ? `${detailedAlbum.title} by ${album?.artists && album.artists.length > 1
      ? album.artists.map(artist => artist.name).join(' & ')
      : album?.release_artist || 'Unknown Artist'
    } | Russ.fm`
    : 'Loading Album... | Russ.fm';

  usePageTitle(pageTitle);

  // Set meta tags for social media sharing
  useMetaTags({
    title: pageTitle,
    description: detailedAlbum
      ? `${detailedAlbum.title} by ${album?.release_artist || 'Unknown Artist'} (${detailedAlbum.year}). ${detailedAlbum.genres?.slice(0, 3).join(', ')}.`
      : 'View album details on Russ.fm',
    image: albumPath ? getAlbumOGImageUrl(albumPath) : undefined,
    url: `${appConfig.siteUrl}/album/${albumPath}`,
    type: 'music.album'
  });

  const loadAlbumData = useCallback(async () => {
    try {
      // Load collection to find this specific album
      const collectionResponse = await fetch('/collection.json');
      const collection = await collectionResponse.json();

      // Find the album by its URI
      const foundAlbum = collection.find((item: Album) => {
        // First try exact URI match
        if (item.uri_release === `/album/${albumPath}/`) {
          return true;
        }

        // Fallback: try sanitized name matching for URL consistency
        // Extract album name and discogs ID from the path (format: "album-name-discogsid")
        const pathMatch = albumPath?.match(/^(.+)-(\d+)$/);
        if (pathMatch) {
          const [, , discogsId] = pathMatch;
          const sanitizedAlbumName = sanitizeFolderName(item.release_name);
          const expectedPath = `${sanitizedAlbumName}-${discogsId}`;
          if (albumPath === expectedPath) {
            return true;
          }
        }

        return false;
      });

      if (foundAlbum) {
        setAlbum(foundAlbum);

        // Load detailed album information
        try {
          // Construct JSON path using the current album path (which is already sanitized)
          const jsonPath = `/album/${albumPath}/${albumPath}.json`;
          const albumDetailResponse = await fetch(jsonPath);
          const albumDetail = await albumDetailResponse.json();
          // Add artist property for MusicPlayerSection compatibility
          albumDetail.artist = foundAlbum.release_artist;
          setDetailedAlbum(albumDetail);
        } catch (error) {
          console.error('Error loading album details:', error);
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading album data:', error);
      setLoading(false);
    }
  }, [albumPath]);

  useEffect(() => {
    loadAlbumData();
  }, [albumPath, loadAlbumData]);

  const formatDuration = (ms: number) => {
    if (!ms) return '';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const convertDurationToMs = (duration: string) => {
    if (!duration) return undefined;
    const parts = duration.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      return (minutes * 60 + seconds) * 1000;
    }
    return undefined;
  };

  const getTrackDuration = (track: Track) => {
    if (track.duration_ms) {
      return formatDuration(track.duration_ms);
    }
    return '';
  };

  const cleanDescription = (text: string) => {
    // Remove HTML tags and clean up text
    return text?.replace(/<[^>]*>/g, '').replace(/\n\s*\n/g, '\n').trim();
  };

  const getAlbumDescription = () => {
    if (detailedAlbum?.services?.apple_music?.raw_attributes?.editorialNotes?.short) {
      return cleanDescription(detailedAlbum.services.apple_music.raw_attributes.editorialNotes.short);
    }
    if (detailedAlbum?.services?.apple_music?.editorial_notes) {
      return cleanDescription(detailedAlbum.services.apple_music.editorial_notes);
    }
    if (detailedAlbum?.services?.lastfm?.wiki_summary) {
      return cleanDescription(detailedAlbum.services.lastfm.wiki_summary);
    }
    return null;
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading album...</p>
        </div>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link to="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Albums
          </Button>
        </Link>
        <Card className="p-8 text-center">
          <CardContent>
            <ListMusic className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Album not found</h3>
            <p className="text-muted-foreground">The requested album could not be found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const year = new Date(album.date_release_year).getFullYear();

  // Get tracks from multiple sources with fallbacks - prioritize Discogs
  const getTracks = (): Track[] => {
    // Try Discogs tracklist first (main tracklist from Discogs data)
    if (detailedAlbum?.tracklist && detailedAlbum.tracklist.length > 0) {
      // Check if this is a compilation with complex track structure
      const firstTrack = detailedAlbum.tracklist[0];
      if (firstTrack && typeof firstTrack === 'object' && 'title' in firstTrack && 'artists' in firstTrack) {
        // This is a compilation format - convert to our standard format
        return detailedAlbum.tracklist.map((track: Track & { title?: string; artists?: Array<{ name: string; discogs_id?: string; spotify_id?: string }>; duration?: string }, index: number) => ({
          track_number: index + 1,
          name: track.title || 'Unknown Track',
          duration_ms: track.duration ? convertDurationToMs(track.duration) : undefined,
          position: track.position,
          artists: track.artists // Keep artist info for compilations
        }));
      } else {
        // This is a regular tracklist format
        return detailedAlbum.tracklist;
      }
    }

    // Fallback to Spotify tracks (only if Discogs tracklist not available)
    if (detailedAlbum?.services?.spotify?.tracks && detailedAlbum.services.spotify.tracks.length > 0) {
      return detailedAlbum.services.spotify.tracks;
    }

    // Fallback to raw Spotify data tracks
    if (detailedAlbum?.services?.spotify?.raw_data?.tracks?.items && detailedAlbum.services.spotify.raw_data.tracks.items.length > 0) {
      return detailedAlbum.services.spotify.raw_data.tracks.items.map((track: {
        track_number?: number;
        name: string;
        duration_ms?: number;
        disc_number?: number;
      }, index: number) => ({
        track_number: track.track_number || index + 1,
        name: track.name || 'Unknown Track',
        duration_ms: track.duration_ms,
        position: (track.disc_number && track.disc_number > 1) ? `${track.disc_number}-${track.track_number}` : undefined,
        artists: undefined
      }));
    }

    // Last fallback to Last.fm tracks
    if (detailedAlbum?.services?.lastfm?.raw_data?.album?.tracks?.track) {
      const lastfmTracks = detailedAlbum.services.lastfm.raw_data.album.tracks.track;
      return (Array.isArray(lastfmTracks) ? lastfmTracks : [lastfmTracks]).map((track: {
        '@attr'?: { rank?: number };
        name: string;
        duration?: string;
      }, index: number) => ({
        track_number: track['@attr']?.rank || index + 1,
        name: track.name || 'Unknown Track',
        duration_ms: track.duration ? parseInt(track.duration) * 1000 : undefined,
        position: undefined,
        artists: undefined
      }));
    }

    return [];
  };

  const tracks = getTracks();

  // Generate CSS custom properties for album colors
  const colorProperties = generateColorProperties(albumColors);

  // Get enhanced text styling for better contrast
  const titleTextStyle = getEnhancedTextColor(albumColors.background, albumColors);

  return (
    <div className="min-h-screen pb-20 -mt-32">
      {/* Hero Section - Full Width & Immersive */}
      <div
        className="relative w-full min-h-[60vh] flex items-end justify-center pb-12 pt-32 px-4 overflow-hidden"
        style={{
          background: createHeroBackground(albumColors),
          ...colorProperties
        }}
      >
        {/* Animated Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-0 left-0 w-full h-full opacity-40 mix-blend-overlay"
            style={{
              background: `radial-gradient(circle at 20% 30%, ${albumColors.accent} 0%, transparent 50%)`
            }}
          />
          <div
            className="absolute bottom-0 right-0 w-full h-full opacity-30 mix-blend-overlay"
            style={{
              background: `radial-gradient(circle at 80% 80%, ${albumColors.accent} 0%, transparent 50%)`
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        </div>

        <div className="container mx-auto relative z-10 max-w-6xl">
          <div className="flex flex-col md:flex-row items-end gap-8 md:gap-12">
            {/* Album Art - Floating & Shadowed */}
            <div className="relative group w-64 md:w-96 lg:w-[450px] flex-shrink-0 mx-auto md:mx-0">
              <div
                className="absolute -inset-4 rounded-2xl opacity-40 blur-2xl transition-all duration-700 group-hover:opacity-60"
                style={{ background: createGlowGradient(albumColors, 'bold') }}
              />
              <img
                src={getAlbumImageFromData(`/album/${albumPath}/`, 'hi-res')}
                onError={handleImageError}
                alt={album.release_name}
                className="relative w-full rounded-xl shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]"
                style={{
                  boxShadow: `0 20px 40px -10px ${albumColors.accent}60`
                }}
              />
            </div>

            {/* Header Info */}
            <div className="flex-1 text-center md:text-left space-y-4">
              <div className="space-y-2">
                <Link to="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back to Collection
                </Link>
                <h1
                  className="text-4xl md:text-6xl font-bold tracking-tight leading-tight text-balance"
                  style={{ color: titleTextStyle.color }}
                >
                  {album.release_name}
                </h1>
                <div className="text-xl md:text-2xl font-medium opacity-90 flex flex-wrap items-center justify-center md:justify-start gap-2">
                  <span>by</span>
                  {album.artists && album.artists.length > 1 ? (
                    album.artists.map((artist, index) => (
                      <React.Fragment key={index}>
                        <Link
                          to={artist.uri_artist}
                          className="hover:underline decoration-2 underline-offset-4"
                          style={{ color: albumColors.accent }}
                        >
                          {artist.name}
                        </Link>
                        {index < album.artists.length - 1 && <span>&</span>}
                      </React.Fragment>
                    ))
                  ) : (
                    <Link
                      to={album.uri_artist}
                      className="hover:underline decoration-2 underline-offset-4"
                      style={{ color: albumColors.accent }}
                    >
                      {album.release_artist}
                    </Link>
                  )}
                </div>
              </div>

              {/* Quick Stats Row */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-medium opacity-80">
                <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                  {year}
                </span>
                <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                  {tracks.length} Tracks
                </span>
                {detailedAlbum?.country && (
                  <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                    {detailedAlbum.country}
                  </span>
                )}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-2">
                {(() => {
                  const cleanGenres = detailedAlbum ? getCleanGenres({
                    genres: [...album.genre_names, ...(detailedAlbum.styles || [])],
                    services: detailedAlbum.services
                  }) : filterGenres(album.genre_names, album.release_artist);

                  return cleanGenres.slice(0, 5).map((tag, index) => (
                    <Link key={index} to={`/albums/1?genre=${encodeURIComponent(tag)}`}>
                      <span
                        className="px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors border"
                        style={{
                          backgroundColor: `${albumColors.accent}20`,
                          borderColor: `${albumColors.accent}40`,
                          color: titleTextStyle.color
                        }}
                      >
                        {tag}
                      </span>
                    </Link>
                  ));
                })()}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-4">
                <AlbumScrobbleButton
                  album={{
                    artist: album.release_artist,
                    album: album.release_name,
                    tracks: tracks.map(t => ({ title: t.name || 'Unknown Track', artist: t.artists?.[0]?.name }))
                  }}
                  className="h-9 px-4 shadow-lg hover:scale-105 transition-transform border-0 text-white"
                  style={{
                    backgroundColor: '#D51007', // Last.fm Brand Color
                  }}
                />

                {detailedAlbum?.services?.apple_music?.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 border-0 hover:scale-105 transition-all text-white"
                    onClick={() => window.open(detailedAlbum.services?.apple_music?.url, '_blank')}
                    style={{ backgroundColor: '#FA243C' }} // Apple Music Brand Color
                  >
                    <SiApplemusic className="mr-2 h-4 w-4" /> Apple Music
                  </Button>
                )}

                {detailedAlbum?.services?.spotify?.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 border-0 hover:scale-105 transition-all text-white"
                    onClick={() => window.open(detailedAlbum.services?.spotify?.url, '_blank')}
                    style={{ backgroundColor: '#1DB954' }} // Spotify Brand Color
                  >
                    <SiSpotify className="mr-2 h-4 w-4" /> Spotify
                  </Button>
                )}

                {detailedAlbum?.discogs_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 border-0 hover:scale-105 transition-all text-white"
                    onClick={() => window.open(detailedAlbum.discogs_url, '_blank')}
                    style={{ backgroundColor: '#333333' }} // Discogs Brand Color
                  >
                    <SiDiscogs className="mr-2 h-4 w-4" /> Discogs
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Blog Style Layout */}
      <div className="container mx-auto px-4 max-w-3xl mt-12 space-y-16">

        {/* Editorial Description */}
        {getAlbumDescription() && (
          <section className="prose prose-lg dark:prose-invert max-w-none">
            <div className="relative">
              <div className="text-lg md:text-xl leading-relaxed text-muted-foreground font-serif">
                {(() => {
                  let description = getAlbumDescription() || '';
                  const readMoreIndex = description.indexOf('Read more on Last.fm');
                  if (readMoreIndex !== -1) description = description.substring(0, readMoreIndex).trim();

                  if (description?.includes('\n')) {
                    return description.split('\n').filter(p => p.trim()).map((p, i) => (
                      <p key={i} className="mb-6">
                        {p.trim()}
                      </p>
                    ));
                  }
                  return <p>{description}</p>;
                })()}
              </div>
            </div>
          </section>
        )}

        {/* Tracklist - Clean & Minimal */}
        {tracks.length > 0 && (
          <section>
            <h3 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <ListMusic className="h-6 w-6 opacity-50" />
              Tracklist
            </h3>
            <div className="space-y-1">
              {tracks.map((track, index) => {
                const isSectionTitle = !track.position && !getTrackDuration(track);
                if (isSectionTitle) {
                  return (
                    <div key={index} className="pt-6 pb-2">
                      <h4 className="text-lg font-semibold text-primary">{track.name}</h4>
                    </div>
                  );
                }
                return (
                  <div key={index} className="group flex items-center justify-between py-3 px-4 -mx-4 rounded-lg hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-6 flex-1 min-w-0">
                      <span className="text-muted-foreground/50 font-mono text-sm w-8 text-right">
                        {track.position || track.track_number || index + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="font-medium text-lg block truncate group-hover:text-primary transition-colors">
                          {track.name}
                        </span>
                        {track.artists && track.artists.length > 0 && (
                          <span className="text-sm text-muted-foreground block truncate">
                            {track.artists.map(a => a.name).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    {getTrackDuration(track) && (
                      <span className="text-muted-foreground/50 font-mono text-sm ml-4">
                        {getTrackDuration(track)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Music Player */}
        {detailedAlbum && (
          <section className="py-8 border-y border-border/50">
            <MusicPlayerSection album={detailedAlbum} />
          </section>
        )}

        {/* Artist Bios - Editorial Style */}
        {detailedAlbum?.artists && detailedAlbum.artists.some(a => a.biography && a.name.toLowerCase() !== 'various') && (
          <section className="space-y-12">
            {detailedAlbum.artists.map((artist, index) =>
              artist.biography && artist.name.toLowerCase() !== 'various' && (
                <div key={index} className="flex flex-col md:flex-row gap-8 items-start">
                  <div className="w-full md:w-1/3 sticky top-24">
                    <img
                      src={getArtistImageFromData(
                        album.artists?.find(a => a.name === artist.name)?.uri_artist || album.uri_artist,
                        'medium'
                      )}
                      alt={artist.name}
                      className="w-full aspect-square object-cover rounded-2xl shadow-lg"
                      onError={handleImageError}
                    />
                    <Link
                      to={album.artists?.find(a => a.name === artist.name)?.uri_artist || album.uri_artist}
                      className="block mt-4 text-center"
                    >
                      <Button variant="outline" className="w-full">View Artist Profile</Button>
                    </Link>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold mb-4">About {artist.name}</h3>
                    <div className="prose dark:prose-invert text-muted-foreground leading-relaxed">
                      {(() => {
                        let bio = artist.biography?.replace(/<[^>]*>/g, '').trim();
                        const readMoreIndex = bio?.indexOf('Read more on Last.fm');
                        if (readMoreIndex !== -1) bio = bio?.substring(0, readMoreIndex).trim();
                        const wikiIndex = bio?.indexOf('Full Wikipedia article:');
                        if (wikiIndex !== -1) bio = bio?.substring(0, wikiIndex).trim();

                        return bio?.split('\n').filter(p => p.trim()).slice(0, 3).map((p, i) => (
                          <p key={i} className="mb-4">{p.trim()}</p>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )
            )}
          </section>
        )}

        {/* Footer Metadata - Subtle & Clean */}
        <footer className="pt-12 mt-12 border-t border-border/50 text-sm text-muted-foreground">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="font-semibold text-foreground">Release Details</h4>
              <dl className="space-y-2">
                {detailedAlbum?.year && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 opacity-60">Year</dt>
                    <dd>{detailedAlbum.year}</dd>
                  </div>
                )}
                {detailedAlbum?.country && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 opacity-60">Country</dt>
                    <dd>{detailedAlbum.country}</dd>
                  </div>
                )}
                {detailedAlbum?.labels && detailedAlbum.labels.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 opacity-60">Label</dt>
                    <dd>{detailedAlbum.labels.join(', ')}</dd>
                  </div>
                )}
                {detailedAlbum?.formats && detailedAlbum.formats.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 opacity-60">Format</dt>
                    <dd>{detailedAlbum.formats.join(', ')}</dd>
                  </div>
                )}
                {detailedAlbum?.styles && detailedAlbum.styles.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 opacity-60">Style</dt>
                    <dd>{detailedAlbum.styles.join(', ')}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 opacity-60">Added</dt>
                  <dd>{new Date(album.date_added).toLocaleDateString()}</dd>
                </div>
              </dl>
            </div>

            {/* Identifiers Section */}
            <div className="space-y-4">
              <h4 className="font-semibold text-foreground">Identifiers</h4>
              <dl className="space-y-3">
                {detailedAlbum?.services?.spotify?.external_ids?.upc && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 opacity-60">UPC</dt>
                      <dd className="font-mono text-xs">{detailedAlbum.services.spotify.external_ids.upc}</dd>
                    </div>
                    {/* Scannable barcode using react-barcode */}
                    <div className="ml-24 bg-white p-2 rounded border border-border/20 w-fit">
                      <Barcode
                        value={detailedAlbum.services.spotify.external_ids.upc}
                        format="EAN13"
                        width={1.5}
                        height={50}
                        displayValue={false}
                        background="#ffffff"
                        lineColor="#000000"
                      />
                    </div>
                  </div>
                )}
                {detailedAlbum?.discogs_id && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 opacity-60">Discogs ID</dt>
                    <dd className="font-mono text-xs">{detailedAlbum.discogs_id}</dd>
                  </div>
                )}
                {detailedAlbum?.spotify_id && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 opacity-60">Spotify ID</dt>
                    <dd className="font-mono text-xs">{detailedAlbum.spotify_id}</dd>
                  </div>
                )}
                {detailedAlbum?.services?.apple_music?.url && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 opacity-60">Apple Music</dt>
                    <dd className="font-mono text-xs truncate">{detailedAlbum.services.apple_music.url.split('/').pop()}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Copyright Section */}
            {detailedAlbum?.services?.spotify?.copyrights && detailedAlbum.services.spotify.copyrights.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-semibold text-foreground">Copyright</h4>
                <div className="text-xs opacity-70 space-y-1">
                  {detailedAlbum.services.spotify.copyrights.map((c, i) => (
                    <div key={i}>{c.text}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </footer>
      </div>
    </div >
  );
}