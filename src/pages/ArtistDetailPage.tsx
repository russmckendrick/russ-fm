import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Disc } from 'lucide-react';
import { SiSpotify, SiApplemusic, SiLastdotfm, SiDiscogs, SiWikipedia } from 'react-icons/si';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlbumCard } from '@/components/AlbumCard';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColors } from '@/hooks/useAlbumColors';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { getArtistImageFromData, getArtistOGImageUrl, handleImageError, sanitizeJsonPath } from '@/lib/image-utils';
import { appConfig } from '@/config/app.config';
import { createGlowGradient, getReadableTextColor } from '@/lib/color-utils';

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

interface ArtistData {
  id?: string;
  name: string;
  biography?: string;
  country?: string;
  formed_date?: string;
  genres: string[];
  followers?: number;
  popularity?: number;
  spotify_id?: string;
  spotify_url?: string;
  discogs_id?: string;
  discogs_url?: string;
  services?: {
    spotify?: {
      id?: string;
      url?: string;
      popularity?: number;
      followers?: {
        total?: number;
      };
      external_urls?: {
        spotify?: string;
      };
    };
    apple_music?: {
      url?: string;
      id?: string;
    };
    lastfm?: {
      url?: string;
      listeners?: number;
      playcount?: number;
      bio?: {
        content?: string;
        summary?: string;
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

export function ArtistDetailPage() {
  const { artistPath } = useParams<{ artistPath: string }>();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artistData, setArtistData] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(true);

  // Select a random album for color extraction
  const randomAlbum = useMemo(() => {
    if (albums.length === 0) return null;
    return albums[Math.floor(Math.random() * albums.length)];
  }, [albums]);

  // Get album path for color extraction
  const randomAlbumPath = randomAlbum?.uri_release.replace('/album/', '').replace('/', '') || '';
  const albumColors = useAlbumColors(randomAlbumPath);

  // Create dynamic styles based on album colors
  const titleTextStyle = useMemo(() => {
    if (!albumColors) return { color: 'inherit' };
    return { color: getReadableTextColor(albumColors.background, albumColors.foreground, albumColors.accent) };
  }, [albumColors]);

  const createHeroBackground = (colors: typeof albumColors) => {
    if (!colors) return 'linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)';
    return `linear-gradient(135deg, ${colors.background} 0%, ${colors.muted} 50%, ${colors.background} 100%)`;
  };

  const colorProperties = useMemo(() => {
    if (!albumColors) return {};
    return {
      '--dynamic-accent': albumColors.accent,
      '--dynamic-foreground': albumColors.foreground,
      '--dynamic-background': albumColors.background,
    } as React.CSSProperties;
  }, [albumColors]);

  // Set page title based on artist data
  const pageTitle = artistData
    ? `${artistData.name} - ${albums.length} Album${albums.length !== 1 ? 's' : ''} | Russ.fm`
    : 'Loading Artist... | Russ.fm';

  usePageTitle(pageTitle);

  // Set meta tags for social media sharing
  useMetaTags({
    title: pageTitle,
    description: artistData
      ? `${artistData.name}. ${artistData.biography?.substring(0, 200) || 'Explore this artist\'s music collection'}... ${albums.length} album${albums.length !== 1 ? 's' : ''} in collection.`
      : 'View artist details on Russ.fm',
    image: artistPath ? getArtistOGImageUrl(artistPath) : undefined,
    url: `${appConfig.siteUrl}/artist/${artistPath}`,
    type: 'music.musician'
  });

  const loadArtistData = useCallback(async () => {
    try {
      // Load collection to find albums by this artist
      const collectionResponse = await fetch('/collection.json');
      const collection = await collectionResponse.json();

      // Filter albums by this artist (decode the artistPath)
      const decodedArtistPath = decodeURIComponent(artistPath || '');
      const targetUri = `/artist/${decodedArtistPath}/`;

      const artistAlbums = collection.filter((album: Album) => {
        // Check direct URI match first
        if (album.uri_artist === targetUri) {
          return true;
        }

        // Check if the sanitized version of the album's artist URI matches
        const albumArtistPath = album.uri_artist.replace('/artist/', '').replace('/', '');
        const sanitizedAlbumArtistPath = sanitizeFolderName(albumArtistPath);
        if (decodedArtistPath === sanitizedAlbumArtistPath) {
          return true;
        }

        // Check if this album has the artist in the artists array
        if (album.artists) {
          const foundInArtists = album.artists.some(artist => {
            // Direct URI match
            if (artist.uri_artist === targetUri) {
              return true;
            }

            // Sanitized URI match
            const individualArtistPath = artist.uri_artist.replace('/artist/', '').replace('/', '');
            const sanitizedIndividualPath = sanitizeFolderName(individualArtistPath);
            return decodedArtistPath === sanitizedIndividualPath;
          });

          if (foundInArtists) {
            return true;
          }
        }

        // Fallback: try sanitized name matching for URL consistency
        const sanitizedArtistName = sanitizeFolderName(album.release_artist);
        if (decodedArtistPath === sanitizedArtistName) {
          return true;
        }

        return false;
      });

      setAlbums(artistAlbums);

      // Load detailed artist information if available
      if (artistAlbums.length > 0) {
        try {
          // Try to get the specific artist's JSON file from the artists array
          let artistJsonUrl = null;

          // Look for this specific artist in the artists array of any album
          for (const album of artistAlbums) {
            if (album.artists) {
              const foundArtist = album.artists.find(artist => {
                // Direct URI match
                if (artist.uri_artist === targetUri) {
                  return true;
                }

                // Sanitized URI match
                const individualArtistPath = artist.uri_artist.replace('/artist/', '').replace('/', '');
                const sanitizedIndividualPath = sanitizeFolderName(individualArtistPath);
                return decodedArtistPath === sanitizedIndividualPath;
              });

              if (foundArtist) {
                artistJsonUrl = foundArtist.json_detailed_artist;
                break;
              }
            }
          }

          // Also check the main artist URI with sanitization fallback
          if (!artistJsonUrl) {
            for (const album of artistAlbums) {
              const albumArtistPath = album.uri_artist.replace('/artist/', '').replace('/', '');
              const sanitizedAlbumArtistPath = sanitizeFolderName(albumArtistPath);
              if (decodedArtistPath === sanitizedAlbumArtistPath) {
                artistJsonUrl = album.json_detailed_artist;
                break;
              }
            }
          }

          // Fallback to the first album's artist JSON if not found in artists array
          if (!artistJsonUrl) {
            artistJsonUrl = artistAlbums[0].json_detailed_artist;
          }

          const sanitizedJsonPath = sanitizeJsonPath(artistJsonUrl);
          const artistDetailResponse = await fetch(sanitizedJsonPath);
          const artistDetail = await artistDetailResponse.json();
          setArtistData(artistDetail);
        } catch (error) {
          console.error('Error loading artist details:', error);
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading artist data:', error);
      setLoading(false);
    }
  }, [artistPath]);

  useEffect(() => {
    loadArtistData();
  }, [artistPath, loadArtistData]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading artist...</p>
        </div>
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link to="/artists">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Artists
          </Button>
        </Link>
        <div className="p-8 text-center glass-card rounded-2xl">
          <Disc className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Artist not found</h3>
          <p className="text-muted-foreground">The requested artist could not be found</p>
        </div>
      </div>
    );
  }

  const artist = albums[0];

  // Get the correct artist name for individual artists
  const getArtistName = () => {
    if (artistData?.name) {
      return artistData.name;
    }

    // Extract artist name from path if available in artists array
    const decodedArtistPath = decodeURIComponent(artistPath || '');
    const targetUri = `/artist/${decodedArtistPath}/`;

    for (const album of albums) {
      if (album.artists) {
        const foundArtist = album.artists.find(artist => artist.uri_artist === targetUri);
        if (foundArtist) {
          return foundArtist.name;
        }
      }
    }

    return artist.release_artist;
  };

  const artistName = getArtistName();
  const allGenres = [...new Set(albums.flatMap(album => album.genre_names))];
  const cleanGenres = getCleanGenresFromArray(allGenres, artistName);

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
              background: albumColors ? `radial-gradient(circle at 20% 30%, ${albumColors.accent} 0%, transparent 50%)` : 'none'
            }}
          />
          <div
            className="absolute bottom-0 right-0 w-full h-full opacity-30 mix-blend-overlay"
            style={{
              background: albumColors ? `radial-gradient(circle at 80% 80%, ${albumColors.accent} 0%, transparent 50%)` : 'none'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        </div>

        <div className="container mx-auto relative z-10 max-w-6xl">
          <div className="flex flex-col md:flex-row items-end gap-8 md:gap-12">
            {/* Artist Image - Floating & Circular */}
            <div className="relative group w-64 md:w-96 lg:w-[450px] flex-shrink-0 mx-auto md:mx-0">
              <div
                className="absolute -inset-4 rounded-full opacity-40 blur-2xl transition-all duration-700 group-hover:opacity-60"
                style={{ background: albumColors ? createGlowGradient(albumColors, 'bold') : 'none' }}
              />
              <img
                src={getArtistImageFromData(`/artist/${decodeURIComponent(artistPath || '')}/`, 'hi-res')}
                alt={artistName}
                className="relative w-full aspect-square rounded-full shadow-2xl transition-transform duration-500 group-hover:scale-[1.02] object-cover"
                style={{
                  boxShadow: albumColors ? `0 20px 40px -10px ${albumColors.accent}60` : undefined
                }}
                onError={handleImageError}
              />
            </div>

            {/* Header Info */}
            <div className="flex-1 text-center md:text-left space-y-4">
              <div className="space-y-2">
                <Link to="/artists" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back to Artists
                </Link>
                <h1
                  className="text-4xl md:text-6xl font-bold tracking-tight leading-tight text-balance"
                  style={{ color: titleTextStyle.color }}
                >
                  {artistName}
                </h1>
              </div>

              {/* Quick Stats Row */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-medium opacity-80">
                <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                  {albums.length} Album{albums.length !== 1 ? 's' : ''}
                </span>
                {artistData?.country && (
                  <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                    {artistData.country}
                  </span>
                )}
                {artistData?.formed_date && (
                  <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                    Formed {artistData.formed_date}
                  </span>
                )}
              </div>

              {/* Tags */}
              {cleanGenres.length > 0 && (
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-2">
                  {cleanGenres.slice(0, 5).map((genre, index) => (
                    <Link key={index} to={`/albums/1?genre=${encodeURIComponent(genre)}`}>
                      <Badge
                        className="px-3 py-1 text-xs font-medium bg-white/10 backdrop-blur-md border border-white/10 hover:bg-white/20 transition-all cursor-pointer"
                        style={{ color: titleTextStyle.color }}
                      >
                        {genre}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-4">
                {artistData?.services?.spotify?.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 border-0 hover:scale-105 transition-all text-white"
                    onClick={() => window.open(artistData.services?.spotify?.url, '_blank')}
                    style={{ backgroundColor: '#1DB954' }}
                  >
                    <SiSpotify className="mr-2 h-4 w-4" /> Spotify
                  </Button>
                )}

                {artistData?.services?.apple_music?.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 border-0 hover:scale-105 transition-all text-white"
                    onClick={() => window.open(artistData.services?.apple_music?.url, '_blank')}
                    style={{ backgroundColor: '#FA243C' }}
                  >
                    <SiApplemusic className="mr-2 h-4 w-4" /> Apple Music
                  </Button>
                )}

                {artistData?.services?.lastfm?.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 border-0 hover:scale-105 transition-all text-white"
                    onClick={() => window.open(artistData.services?.lastfm?.url, '_blank')}
                    style={{ backgroundColor: '#D51007' }}
                  >
                    <SiLastdotfm className="mr-2 h-4 w-4" /> Last.fm
                  </Button>
                )}

                {(artistData?.discogs_url || artistData?.services?.discogs?.url) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 border-0 hover:scale-105 transition-all text-white"
                    onClick={() => window.open(artistData?.discogs_url || artistData?.services?.discogs?.url, '_blank')}
                    style={{ backgroundColor: '#333333' }}
                  >
                    <SiDiscogs className="mr-2 h-4 w-4" /> Discogs
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 border-0 hover:scale-105 transition-all text-white"
                  onClick={() => window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(artistName)}`, '_blank')}
                  style={{ backgroundColor: '#000000' }}
                >
                  <SiWikipedia className="mr-2 h-4 w-4" /> Wikipedia
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Artist Biography */}
        {artistData?.biography && (
          <section className="py-12">
            <h2 className="text-3xl font-bold mb-6">Biography</h2>
            <div className="relative">
              <div className="text-lg md:text-xl leading-relaxed text-muted-foreground font-serif">
                {(() => {
                  let bio = artistData.biography?.replace(/<[^>]*>/g, '').trim();

                  // Remove everything from "Read more on Last.fm" onwards
                  const readMoreIndex = bio?.indexOf('Read more on Last.fm');
                  if (readMoreIndex !== -1) {
                    bio = bio?.substring(0, readMoreIndex).trim();
                  }

                  // Remove everything from "Full Wikipedia article:" onwards
                  const wikiIndex = bio?.indexOf('Full Wikipedia article:');
                  if (wikiIndex !== -1) {
                    bio = bio?.substring(0, wikiIndex).trim();
                  }

                  // Handle different biography formats
                  if (bio?.includes('\n')) {
                    // TheAudioDB format: Uses actual \n characters for paragraphs
                    return bio.split('\n').filter(paragraph => paragraph.trim()).map((paragraph, index) => (
                      <p key={index} className="mb-4 last:mb-0">
                        {paragraph.trim()}
                      </p>
                    ));
                  } else {
                    // Legacy format: Single paragraph, no newlines
                    return (
                      <p className="mb-0">
                        {bio}
                      </p>
                    );
                  }
                })()}
              </div>
            </div>
          </section>
        )}

        {/* Albums Grid */}
        <section className="py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Disc className="h-8 w-8" />
              Albums in Collection
            </h2>
            <Badge variant="outline" className="text-base px-3 py-1">
              {albums.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {albums
              .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
              .map((album) => (
                <AlbumCard
                  key={album.uri_release}
                  album={album}
                />
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}