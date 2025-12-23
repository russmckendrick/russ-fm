import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ListMusic } from 'lucide-react';
import { SiSpotify, SiDiscogs, SiApplemusic } from 'react-icons/si';
import { Button } from '@/components/ui/button';
import { ServiceButton } from '@/components/ui/service-button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { getCleanGenres, getCleanGenresFromArray } from '@/lib/genreUtils';
import { GenreTag } from '@/components/ui/genre-tag';
import { MetadataBadge } from '@/components/ui/metadata-badge';
import { MusicPlayerSection } from '@/components/MusicPlayerSection';
import { AlbumScrobbleButton } from '@/components/AlbumScrobbleButton';
import { getAlbumImageFromData, getArtistImageFromData, getArtistAvatarFromData, getAlbumOGImageUrl, handleImageError } from '@/lib/image-utils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { useAlbumColorsWithFallback } from '@/hooks/useAlbumColors';
import { getEnhancedTextColor, generateColorProperties, createHeroBackground, createGlowGradient, getAccessibleAccentColor } from '@/lib/color-utils';
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
    const candidates: (string | undefined | null)[] = [
      detailedAlbum?.services?.apple_music?.raw_attributes?.editorialNotes?.short,
      detailedAlbum?.services?.apple_music?.raw_attributes?.editorialNotes?.standard,
      detailedAlbum?.services?.apple_music?.editorial_notes,
      detailedAlbum?.services?.lastfm?.wiki_summary,
      detailedAlbum?.services?.lastfm?.wiki_content,
      detailedAlbum?.services?.perplexity?.description,  // Perplexity AI fallback
    ];

    let longest: string | null = null;
    let maxLength = 0;

    for (const candidate of candidates) {
      if (candidate) {
        const cleaned = cleanDescription(candidate);
        if (cleaned && cleaned.length > maxLength) {
          maxLength = cleaned.length;
          longest = cleaned;
        }
      }
    }

    return longest;
  };

  // Group tracks by vinyl side or disc number, with LP grouping for multi-disc vinyl
  const groupTracksBySide = (trackList: Track[]) => {
    type SideGroup = { label: string; tracks: Track[] };
    type LPGroup = { lpLabel: string; sides: SideGroup[] };

    // Check if this is a box set with section headers (tracks with no position acting as headers)
    const hasSectionHeaders = trackList.some((track, index) => {
      const isHeader = !track.position && !track.duration_ms && track.name;
      const nextTrack = trackList[index + 1];
      const nextHasPosition = nextTrack && (nextTrack.position || nextTrack.duration_ms);
      return isHeader && nextHasPosition;
    });

    // Check if tracks have vinyl-style positions (A1, B1, etc.)
    const hasVinylPositions = trackList.some(track => /^[A-Z]\d/.test(track.position || ''));

    if (hasSectionHeaders) {
      // Box set format: use section headers as group labels
      const lpGroups: LPGroup[] = [];
      let currentLp: LPGroup | null = null;
      let currentSide: SideGroup | null = null;
      let currentSideKey = '';

      trackList.forEach((track) => {
        const isHeader = !track.position && !track.duration_ms && track.name;

        if (isHeader) {
          // Parse header like "Mental Notes (2025 Remaster) - Side 1"
          const headerMatch = track.name.match(/^(.+?)\s*-\s*Side\s*(\d+|[AB])$/i);

          if (headerMatch) {
            const [, albumName, sideNum] = headerMatch;
            const normalizedSide = sideNum === '1' || sideNum.toUpperCase() === 'A' ? 'A' : 'B';

            // Check if this is a new LP/album or same LP different side
            if (!currentLp || currentLp.lpLabel !== albumName.trim()) {
              currentLp = { lpLabel: albumName.trim(), sides: [] };
              lpGroups.push(currentLp);
            }

            currentSide = { label: `Side ${normalizedSide}`, tracks: [] };
            currentLp.sides.push(currentSide);
            currentSideKey = '';
          } else {
            // Header without "Side X" - treat as standalone disc/album section
            currentLp = { lpLabel: track.name, sides: [] };
            lpGroups.push(currentLp);
            currentSide = null;
            currentSideKey = '';
          }
        } else {
          // Check if track has vinyl position (A1, B2, etc.)
          const position = track.position || '';
          const vinylMatch = position.match(/^([A-Z])\d/);

          if (hasVinylPositions && vinylMatch) {
            const sideKey = vinylMatch[1];

            // If side changed within current LP section, create new side group
            if (sideKey !== currentSideKey) {
              currentSideKey = sideKey;
              currentSide = { label: `Side ${sideKey}`, tracks: [] };
              if (currentLp) {
                currentLp.sides.push(currentSide);
              } else {
                // No LP header yet, create default
                currentLp = { lpLabel: '', sides: [currentSide] };
                lpGroups.push(currentLp);
              }
            }
          }

          if (currentSide) {
            currentSide.tracks.push(track);
          } else if (currentLp) {
            // Track in LP section but no side yet
            currentSide = { label: '', tracks: [track] };
            currentLp.sides.push(currentSide);
          } else {
            // Track before any header - create default group
            currentLp = { lpLabel: '', sides: [] };
            lpGroups.push(currentLp);
            currentSide = { label: '', tracks: [track] };
            currentLp.sides.push(currentSide);
          }
        }
      });

      // Filter out empty groups
      const filteredGroups = lpGroups.filter(lp => lp.sides.some(s => s.tracks.length > 0));

      if (filteredGroups.length > 0) {
        return { type: 'lp' as const, groups: filteredGroups };
      }
    }

    // Standard vinyl/disc format detection
    const sides: { sideKey: string; tracks: Track[] }[] = [];
    let currentSide: { sideKey: string; tracks: Track[] } | null = null;

    trackList.forEach((track) => {
      const position = track.position || '';
      let sideKey = '';

      if (/^[A-Z]\d/.test(position)) {
        // Vinyl format: A1, B2, etc.
        sideKey = position[0];
      } else if (/^\d+-\d+/.test(position)) {
        // Multi-disc format: 1-5, 2-3, etc.
        sideKey = `disc-${position.split('-')[0]}`;
      }

      if (sideKey && (!currentSide || currentSide.sideKey !== sideKey)) {
        currentSide = { sideKey, tracks: [] };
        sides.push(currentSide);
      }

      if (currentSide) {
        currentSide.tracks.push(track);
      } else {
        if (sides.length === 0) {
          sides.push({ sideKey: '', tracks: [] });
        }
        sides[0].tracks.push(track);
      }
    });

    // Check if we need LP grouping (more than 2 vinyl sides)
    const vinylSides = sides.filter(s => s.sideKey && !s.sideKey.startsWith('disc-'));
    const needsLPGrouping = vinylSides.length > 2;

    if (needsLPGrouping) {
      // Group into LPs (A,B = LP1, C,D = LP2, etc.)
      const lpGroups: LPGroup[] = [];

      sides.forEach(side => {
        if (side.sideKey && !side.sideKey.startsWith('disc-')) {
          const sideCode = side.sideKey.charCodeAt(0) - 65; // A=0, B=1, C=2, etc.
          const lpNumber = Math.floor(sideCode / 2) + 1;
          const sideLetter = sideCode % 2 === 0 ? 'A' : 'B';

          let lpGroup = lpGroups.find(lp => lp.lpLabel === `LP${lpNumber}`);
          if (!lpGroup) {
            lpGroup = { lpLabel: `LP${lpNumber}`, sides: [] };
            lpGroups.push(lpGroup);
          }
          lpGroup.sides.push({ label: `Side ${sideLetter}`, tracks: side.tracks });
        } else if (side.sideKey.startsWith('disc-')) {
          // Treat disc format as its own LP
          const discNum = side.sideKey.split('-')[1];
          lpGroups.push({ lpLabel: `Disc ${discNum}`, sides: [{ label: '', tracks: side.tracks }] });
        }
      });

      return { type: 'lp' as const, groups: lpGroups };
    } else {
      // Simple flat structure
      const flatGroups: SideGroup[] = sides.map(side => {
        let label = '';
        if (side.sideKey && !side.sideKey.startsWith('disc-')) {
          label = `Side ${side.sideKey}`;
        } else if (side.sideKey.startsWith('disc-')) {
          label = `Disc ${side.sideKey.split('-')[1]}`;
        }
        return { label, tracks: side.tracks };
      });

      return { type: 'flat' as const, groups: flatGroups };
    }
  };

  // Calculate total album duration
  const calculateTotalDuration = (trackList: Track[]) => {
    const totalMs = trackList.reduce((sum, track) => {
      if (track.duration_ms) return sum + track.duration_ms;
      return sum;
    }, 0);

    if (totalMs === 0) return null;

    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${seconds}s`;
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
    <PageContainer variant="hero">
      {/* Hero Section - Full Width & Immersive */}
      <div
        className="relative w-full min-h-[60vh] flex items-end justify-center pb-12 pt-28 px-4 overflow-hidden"
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
                  className="text-4xl md:text-6xl font-bold tracking-tight leading-tight text-balance text-foreground"
                >
                  {album.release_name}
                </h1>
                <div className="text-xl md:text-2xl font-medium opacity-90 flex flex-wrap items-center justify-center md:justify-start gap-3 text-foreground">
                  {/* Artist Avatar(s) */}
                  {album.artists && album.artists.length > 1 ? (
                    <div className="flex -space-x-2">
                      {album.artists.map((artist, index) => (
                        <Link key={index} to={artist.uri_artist} className="group/avatar">
                          <Avatar className="h-10 w-10 ring-2 ring-background shadow-md transition-transform group-hover/avatar:scale-110 group-hover/avatar:z-10 relative">
                            <AvatarImage
                              src={getArtistAvatarFromData(artist.uri_artist)}
                              alt={artist.name}
                              onError={handleImageError}
                            />
                            <AvatarFallback className="text-xs bg-muted">
                              {artist.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Link to={album.uri_artist} className="group/avatar">
                      <Avatar className="h-10 w-10 ring-2 ring-background shadow-md transition-transform group-hover/avatar:scale-110">
                        <AvatarImage
                          src={getArtistAvatarFromData(album.uri_artist)}
                          alt={album.release_artist}
                          onError={handleImageError}
                        />
                        <AvatarFallback className="text-xs bg-muted">
                          {album.release_artist.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                  )}
                  {album.artists && album.artists.length > 1 ? (
                    album.artists.map((artist, index) => (
                      <React.Fragment key={index}>
                        <Link
                          to={artist.uri_artist}
                          className="hover:underline decoration-2 underline-offset-4 text-foreground"
                        >
                          {artist.name}
                        </Link>
                        {index < album.artists.length - 1 && <span>&</span>}
                      </React.Fragment>
                    ))
                  ) : (
                    <Link
                      to={album.uri_artist}
                      className="hover:underline decoration-2 underline-offset-4 text-foreground"
                    >
                      {album.release_artist}
                    </Link>
                  )}
                </div>
              </div>

              {/* Quick Stats Row */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-sm font-medium">
                <MetadataBadge>{year}</MetadataBadge>
                <MetadataBadge>{tracks.length} Tracks</MetadataBadge>
                {detailedAlbum?.country && (
                  <MetadataBadge>{detailedAlbum.country}</MetadataBadge>
                )}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-2">
                {(() => {
                  const cleanGenres = detailedAlbum ? getCleanGenres({
                    genres: [...album.genre_names, ...(detailedAlbum.styles || [])],
                    services: detailedAlbum.services
                  }) : getCleanGenresFromArray(album.genre_names, album.release_artist);

                  return cleanGenres.slice(0, 5).map((tag, index) => (
                    <GenreTag key={index} genre={tag} size="md" linkable={true} />
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
                />

                {detailedAlbum?.services?.apple_music?.url && (
                  <ServiceButton
                    service="apple-music"
                    url={detailedAlbum.services?.apple_music?.url}
                    icon={<SiApplemusic className="h-4 w-4" />}
                  >
                    Apple Music
                  </ServiceButton>
                )}

                {detailedAlbum?.services?.spotify?.url && (
                  <ServiceButton
                    service="spotify"
                    url={detailedAlbum.services?.spotify?.url}
                    icon={<SiSpotify className="h-4 w-4" />}
                  >
                    Spotify
                  </ServiceButton>
                )}

                {detailedAlbum?.discogs_url && (
                  <ServiceButton
                    service="discogs"
                    url={detailedAlbum.discogs_url}
                    icon={<SiDiscogs className="h-4 w-4" />}
                  >
                    Discogs
                  </ServiceButton>
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

        {/* Tracklist - Clean & Minimal with Side Grouping */}
        {tracks.length > 0 && (() => {
          const trackGrouping = groupTracksBySide(tracks);
          const totalDuration = calculateTotalDuration(tracks);

          // Helper to render a track row
          const renderTrack = (track: Track, index: number, showSimpleNumbers: boolean) => {
            const isSectionTitle = !track.position && !getTrackDuration(track) && !track.duration_ms;

            if (isSectionTitle) {
              return (
                <div key={index} className="pt-6 pb-2">
                  <h4 className="text-lg font-semibold text-primary">{track.name}</h4>
                </div>
              );
            }

            return (
              <div
                key={index}
                className="group flex items-center justify-between py-3 px-4 -mx-4 rounded-lg transition-colors hover:bg-secondary/30"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span className="text-muted-foreground/40 font-mono text-sm w-8 text-right tabular-nums">
                    {showSimpleNumbers
                      ? (track.position?.replace(/^[A-Z]/, '') || track.track_number || index + 1)
                      : (track.position || track.track_number || index + 1)
                    }
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium block truncate transition-colors group-hover:text-primary">
                      {track.name}
                    </span>
                    {track.artists && track.artists.length > 0 && (
                      <span className="text-sm text-muted-foreground/70 block truncate">
                        {track.artists.map(a => a.name).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                {getTrackDuration(track) && (
                  <span className="text-muted-foreground/40 font-mono text-sm ml-4 tabular-nums">
                    {getTrackDuration(track)}
                  </span>
                )}
              </div>
            );
          };

          // Get accessible accent color for tracklist headers (needs good contrast on white)
          const accessibleAccent = getAccessibleAccentColor(albumColors.accent);

          // Helper to render a side section
          const renderSide = (label: string, tracks: Track[], index: number) => (
            <div key={index}>
              {label && (
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="text-sm font-semibold uppercase tracking-wider"
                    style={{ color: accessibleAccent }}
                  >
                    {label}
                  </span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
              )}
              <div className="space-y-0.5">
                {tracks.map((track, trackIndex) => renderTrack(track, trackIndex, !!label))}
              </div>
            </div>
          );

          return (
            <section>
              <h3 className="text-2xl font-bold mb-8 text-foreground">
                Tracklist
              </h3>

              {trackGrouping.type === 'lp' ? (
                // LP-grouped layout with bordered containers
                <div className="space-y-8">
                  {trackGrouping.groups.map((lpGroup, lpIndex) => (
                    <div
                      key={lpIndex}
                      className="border border-border/50 rounded-xl p-6"
                    >
                      {/* LP Header */}
                      <div className="mb-6">
                        <span
                          className="text-lg font-bold"
                          style={{ color: accessibleAccent }}
                        >
                          {lpGroup.lpLabel}
                        </span>
                      </div>
                      {/* Sides within LP */}
                      <div className="space-y-6">
                        {lpGroup.sides.map((side, sideIndex) => renderSide(side.label, side.tracks, sideIndex))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Flat layout for single LP or simple albums
                <div className="space-y-8">
                  {trackGrouping.groups.map((group, groupIndex) => renderSide(group.label, group.tracks, groupIndex))}
                </div>
              )}

              {/* Total Duration Footer */}
              {totalDuration && (
                <div className="mt-6 pt-4 border-t border-border/30 flex justify-end">
                  <span className="text-sm text-muted-foreground/60">
                    Total runtime: <span className="font-medium text-muted-foreground">{totalDuration}</span>
                  </span>
                </div>
              )}
            </section>
          );
        })()}

        {/* Music Player */}
        {detailedAlbum && (
          <section className="py-12">
            <h3 className="text-2xl font-bold mb-8 text-foreground">Listen to {detailedAlbum.title}</h3>
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
                    <h3 className="text-2xl font-bold mb-4 text-foreground">About {artist.name}</h3>
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
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 opacity-60">UPC</dt>
                    <dd className="font-mono text-xs">{detailedAlbum.services.spotify.external_ids.upc}</dd>
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
    </PageContainer>
  );
}