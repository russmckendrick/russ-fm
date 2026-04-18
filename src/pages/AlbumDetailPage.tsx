import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { SiSpotify, SiDiscogs, SiApplemusic } from 'react-icons/si';
import { ServiceButton } from '@/components/ui/service-button';
import { PageContainer, SectionHeader } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { getCleanGenres, getCleanGenresFromArray } from '@/lib/genreUtils';
import { GenreTag } from '@/components/ui/genre-tag';
import { MusicPlayerSection } from '@/components/MusicPlayerSection';
import { VideoSection } from '@/components/VideoSection';
import { AlbumScrobbleButton } from '@/components/AlbumScrobbleButton';
import { getAlbumImageFromData, getArtistImageFromData, getArtistAvatarFromData, getAlbumOGImageUrl, handleImageError } from '@/lib/image-utils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { useAlbumColorsWithFallback } from '@/hooks/useAlbumColors';
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
  videos?: string[];
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
          // Verify the item's Discogs ID matches the one from the URL
          const itemDiscogsId = item.uri_release.match(/(\d+)/)?.[1];
          if (itemDiscogsId === discogsId) {
            const sanitizedAlbumName = sanitizeFolderName(item.release_name);
            const expectedPath = `${sanitizedAlbumName}-${discogsId}`;
            if (albumPath === expectedPath) {
              return true;
            }
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
      <PageContainer>
        <div className="py-16 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          Loading album…
        </div>
      </PageContainer>
    );
  }

  if (!album) {
    return (
      <PageContainer>
        <div className="py-16">
          <Link to="/albums/1" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim hover:text-ink">
            ← Albums
          </Link>
          <div className="mt-8 border border-rule-strong bg-paper-2/40 px-6 py-16 text-center font-grot">
            <p className="text-[17px] font-semibold text-ink">Album not found</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
              The requested album could not be found
            </p>
          </div>
        </div>
      </PageContainer>
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
  const description = (() => {
    let d = getAlbumDescription() || '';
    const i = d.indexOf('Read more on Last.fm');
    if (i !== -1) d = d.substring(0, i).trim();
    return d;
  })();
  const heroTint = albumColors.background;
  const cleanGenresList = detailedAlbum
    ? getCleanGenres({
        genres: [...album.genre_names, ...(detailedAlbum.styles || [])],
        services: detailedAlbum.services,
      })
    : getCleanGenresFromArray(album.genre_names, album.release_artist);

  // Faux catalogue number from Discogs ID (e.g. 37044327 → CAT. 327)
  const catNo = (() => {
    const m = album.uri_release.match(/-(\d+)\/?$/);
    return m ? `CAT. ${m[1].slice(-3)}` : 'CAT.';
  })();

  return (
    <PageContainer variant="hero">
      {/* Hero ----------------------------------------------------------- */}
      <section className="relative isolate overflow-hidden bg-paper">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${heroTint} 0%, transparent 65%)`,
            mixBlendMode: 'multiply',
            opacity: 0.85,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 hidden dark:block"
          style={{
            background: `linear-gradient(135deg, ${heroTint} 0%, transparent 65%)`,
            mixBlendMode: 'screen',
            opacity: 0.7,
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-[1640px] px-5 pb-14 pt-10 md:px-8 md:pb-20 md:pt-14">
          <nav className="mb-8 flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
            <Link to="/albums/1" className="transition-colors hover:text-ink">Albums</Link>
            <span>/</span>
            <span className="text-ink">{album.release_name}</span>
          </nav>

          <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-14">
            {/* Header text */}
            <div className="flex min-w-0 flex-col gap-6">
              <div>
                <div className="mb-4 flex flex-wrap items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
                  <span className="text-hl">{catNo}</span>
                  {detailedAlbum?.labels?.[0] && (
                    <>
                      <span>·</span>
                      <span>{detailedAlbum.labels[0]}</span>
                    </>
                  )}
                  {detailedAlbum?.formats?.[0] && (
                    <>
                      <span>·</span>
                      <span>{detailedAlbum.formats[0]}</span>
                    </>
                  )}
                </div>
                <h1 className="text-[clamp(40px,7vw,92px)] font-semibold leading-[0.98] tracking-[-0.025em] text-ink">
                  {album.release_name}
                </h1>

                {/* Artist row with avatars */}
                <div className="mt-4 flex flex-wrap items-center gap-3 font-grot text-[20px] font-semibold text-ink md:text-[24px]">
                  {album.artists && album.artists.length > 1 ? (
                    <div className="flex -space-x-2">
                      {album.artists.map((artist, i) => (
                        <Link key={i} to={artist.uri_artist} className="shrink-0">
                          <img
                            src={getArtistAvatarFromData(artist.uri_artist)}
                            alt={artist.name}
                            onError={handleImageError}
                            className="h-10 w-10 rounded-full border-2 border-paper object-cover"
                          />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Link to={album.uri_artist} className="shrink-0">
                      <img
                        src={getArtistAvatarFromData(album.uri_artist)}
                        alt={album.release_artist}
                        onError={handleImageError}
                        className="h-10 w-10 rounded-full border-2 border-paper object-cover"
                      />
                    </Link>
                  )}
                  {album.artists && album.artists.length > 1 ? (
                    album.artists.map((artist, i) => (
                      <React.Fragment key={i}>
                        <Link to={artist.uri_artist} className="transition-colors hover:text-hl">
                          {artist.name}
                        </Link>
                        {i < album.artists.length - 1 && (
                          <span className="text-ink-dim">&</span>
                        )}
                      </React.Fragment>
                    ))
                  ) : (
                    <Link to={album.uri_artist} className="transition-colors hover:text-hl">
                      {album.release_artist}
                    </Link>
                  )}
                </div>
              </div>

              {/* KV strip */}
              <dl className="grid max-w-2xl grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong sm:grid-cols-4">
                <KV label="Year" value={String(year || '—')} />
                <KV label="Tracks" value={String(tracks.length)} />
                <KV
                  label="Added"
                  value={album.date_added
                    ? new Date(album.date_added).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase()
                    : '—'}
                />
                {detailedAlbum?.country && <KV label="Country" value={detailedAlbum.country} />}
              </dl>

              {cleanGenresList.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {cleanGenresList.slice(0, 6).map((g) => (
                    <GenreTag key={g} genre={g} size="md" linkable />
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <AlbumScrobbleButton
                  album={{
                    artist: album.release_artist,
                    album: album.release_name,
                    tracks: tracks.map(t => ({
                      title: t.name || 'Unknown Track',
                      artist: t.artists?.[0]?.name,
                    })),
                  }}
                />
                {detailedAlbum?.services?.apple_music?.url && (
                  <ServiceButton
                    service="apple-music"
                    url={detailedAlbum.services.apple_music.url}
                    icon={<SiApplemusic className="h-4 w-4" />}
                  >
                    Apple Music
                  </ServiceButton>
                )}
                {detailedAlbum?.services?.spotify?.url && (
                  <ServiceButton
                    service="spotify"
                    url={detailedAlbum.services.spotify.url}
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

            {/* Sleeve */}
            <div className="mx-auto w-full max-w-[420px] shrink-0 md:mx-0 md:w-[380px] lg:w-[440px]">
              <div
                className="aspect-square w-full overflow-hidden bg-paper-2"
                style={{
                  boxShadow: `0 40px 80px -20px ${albumColors.background}, 0 6px 20px -6px rgba(14,13,11,0.15)`,
                }}
              >
                <img
                  src={getAlbumImageFromData(`/album/${albumPath}/`, 'hi-res')}
                  onError={handleImageError}
                  alt={album.release_name}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main content --------------------------------------------------- */}
      <div className="mx-auto w-full max-w-[1640px] px-5 py-14 md:px-8 md:py-20">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-20">
          <div className="flex flex-col gap-16">
            {description && (
              <section>
                <SectionHeader num="01" label="About this record" />
                <div className="mt-6 font-grot text-[17px] leading-[1.7] text-ink-2">
                  {description.includes('\n') ? (
                    description.split('\n').filter(p => p.trim()).map((p, i) => (
                      <p key={i} className="mb-5 last:mb-0">{p.trim()}</p>
                    ))
                  ) : (
                    <p>{description}</p>
                  )}
                </div>
              </section>
            )}

            {tracks.length > 0 && (() => {
              const trackGrouping = groupTracksBySide(tracks);
              const totalDuration = calculateTotalDuration(tracks);

              const renderTrack = (track: Track, index: number, showSimpleNumbers: boolean) => {
                const isSectionTitle = !track.position && !getTrackDuration(track) && !track.duration_ms;
                if (isSectionTitle) {
                  return (
                    <li key={index} className="px-0 pb-2 pt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-hl">
                      {track.name}
                    </li>
                  );
                }
                return (
                  <li
                    key={index}
                    className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-rule py-2.5 font-grot last:border-b-0"
                  >
                    <span className="font-mono text-[11px] tracking-[0.04em] text-ink-dim tabular-nums">
                      {showSimpleNumbers
                        ? (track.position?.replace(/^[A-Z]/, '') || track.track_number || index + 1)
                        : (track.position || track.track_number || index + 1)}
                    </span>
                    <span className="min-w-0 truncate text-[15px] text-ink">
                      {track.name}
                      {track.artists && track.artists.length > 0 && (
                        <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-dim">
                          {track.artists.map(a => a.name).join(', ')}
                        </span>
                      )}
                    </span>
                    {getTrackDuration(track) && (
                      <span className="font-mono text-[11px] tabular-nums text-ink-dim">
                        {getTrackDuration(track)}
                      </span>
                    )}
                  </li>
                );
              };

              const renderSide = (label: string, tracks: Track[], index: number) => (
                <div key={index}>
                  {label && (
                    <div className="mb-2 flex items-baseline gap-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-hl">
                      <span>{label}</span>
                      <span className="h-px flex-1 bg-rule" />
                    </div>
                  )}
                  <ul>
                    {tracks.map((t, i) => renderTrack(t, i, !!label))}
                  </ul>
                </div>
              );

              return (
                <section>
                  <SectionHeader num={description ? '02' : '01'} label="Tracklist" count={tracks.length} />
                  <div className="mt-6">
                    {trackGrouping.type === 'lp' ? (
                      <div className="flex flex-col gap-10">
                        {trackGrouping.groups.map((lpGroup, lpIndex) => (
                          <div key={lpIndex} className="border border-rule-strong bg-paper p-5 md:p-6">
                            <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-hl">
                              {lpGroup.lpLabel}
                            </div>
                            <div className="flex flex-col gap-6">
                              {lpGroup.sides.map((side, sideIndex) => renderSide(side.label, side.tracks, sideIndex))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-8">
                        {trackGrouping.groups.map((group, groupIndex) => renderSide(group.label, group.tracks, groupIndex))}
                      </div>
                    )}

                    {totalDuration && (
                      <div className="mt-6 flex justify-end border-t border-rule pt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
                        Total runtime · <span className="ml-2 text-ink">{totalDuration}</span>
                      </div>
                    )}
                  </div>
                </section>
              );
            })()}

            {detailedAlbum && (detailedAlbum.services?.spotify?.id || detailedAlbum.services?.spotify?.url || detailedAlbum.services?.apple_music?.url) && (
              <section>
                <SectionHeader
                  num={description && tracks.length ? '03' : (description || tracks.length ? '02' : '01')}
                  label={`Listen to ${detailedAlbum.title}`}
                />
                <div className="mt-6 border border-rule-strong bg-paper p-5 md:p-6">
                  <MusicPlayerSection album={detailedAlbum} />
                </div>
              </section>
            )}

            {detailedAlbum?.videos && detailedAlbum.videos.length > 0 && (
              <section>
                <SectionHeader label="Videos" count={detailedAlbum.videos.length} />
                <div className="mt-6">
                  <VideoSection videos={detailedAlbum.videos} />
                </div>
              </section>
            )}

            {detailedAlbum?.artists && detailedAlbum.artists.some(a => a.biography && a.name.toLowerCase() !== 'various') && (
              <section>
                <SectionHeader label="About the artist" />
                <div className="mt-6 flex flex-col gap-12">
                  {detailedAlbum.artists.map((artist, index) => {
                    if (!artist.biography || artist.name.toLowerCase() === 'various') return null;
                    const artistUri = album.artists?.find(a => a.name === artist.name)?.uri_artist || album.uri_artist;
                    let bio = artist.biography.replace(/<[^>]*>/g, '').trim();
                    const readMore = bio.indexOf('Read more on Last.fm');
                    if (readMore !== -1) bio = bio.substring(0, readMore).trim();
                    const wiki = bio.indexOf('Full Wikipedia article:');
                    if (wiki !== -1) bio = bio.substring(0, wiki).trim();

                    const isLong = bio.length > 500;
                    let display = bio;
                    if (isLong) {
                      const truncated = bio.substring(0, 500);
                      const lastSpace = truncated.lastIndexOf(' ');
                      display = lastSpace > 400 ? truncated.substring(0, lastSpace) : truncated;
                    }
                    const paragraphs = display.split('\n').filter(p => p.trim());

                    return (
                      <div key={index} className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
                        <div>
                          <img
                            src={getArtistImageFromData(artistUri, 'medium')}
                            alt={artist.name}
                            onError={handleImageError}
                            className="aspect-square w-full rounded-full border border-rule-strong object-cover"
                          />
                          <h4 className="mt-4 font-grot text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink">
                            {artist.name}
                          </h4>
                          <Link
                            to={artistUri}
                            className="mt-1 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors hover:text-hl"
                          >
                            View profile →
                          </Link>
                        </div>
                        <div className="font-grot text-[16px] leading-[1.7] text-ink-2">
                          {paragraphs.map((p, i) => (
                            <p key={i} className="mb-4 last:mb-0">{p.trim()}</p>
                          ))}
                          {isLong && (
                            <Link
                              to={artistUri}
                              className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-hl"
                            >
                              Read more about {artist.name} →
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar ------------------------------------------------------ */}
          <aside className="flex flex-col gap-8 font-grot lg:sticky lg:top-24 lg:self-start">
            <div>
              <h3 className="mb-3 border-b border-rule pb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dim">
                Release details
              </h3>
              <dl className="grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong">
                {detailedAlbum?.year && <KV label="Year" value={String(detailedAlbum.year)} />}
                {detailedAlbum?.country && <KV label="Country" value={detailedAlbum.country} />}
                {detailedAlbum?.labels?.[0] && <KV label="Label" value={detailedAlbum.labels.join(', ')} />}
                {detailedAlbum?.formats?.[0] && <KV label="Format" value={detailedAlbum.formats.join(', ')} />}
                {detailedAlbum?.styles?.[0] && <KV label="Style" value={detailedAlbum.styles.slice(0, 3).join(', ')} />}
                <KV
                  label="Added"
                  value={new Date(album.date_added).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                />
              </dl>
            </div>

            {(detailedAlbum?.services?.spotify?.external_ids?.upc ||
              detailedAlbum?.discogs_id ||
              detailedAlbum?.spotify_id) && (
              <div>
                <h3 className="mb-3 border-b border-rule pb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dim">
                  Identifiers
                </h3>
                <dl className="flex flex-col gap-1.5 font-mono text-[11px] text-ink-2">
                  {detailedAlbum?.services?.spotify?.external_ids?.upc && (
                    <IdRow label="UPC" value={detailedAlbum.services.spotify.external_ids.upc} />
                  )}
                  {detailedAlbum?.discogs_id && (
                    <IdRow label="Discogs" value={String(detailedAlbum.discogs_id)} />
                  )}
                  {detailedAlbum?.spotify_id && (
                    <IdRow label="Spotify" value={detailedAlbum.spotify_id} />
                  )}
                </dl>
              </div>
            )}

            {detailedAlbum?.services?.spotify?.copyrights && detailedAlbum.services.spotify.copyrights.length > 0 && (
              <div>
                <h3 className="mb-3 border-b border-rule pb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dim">
                  Copyright
                </h3>
                <div className="flex flex-col gap-1 font-mono text-[10.5px] leading-relaxed text-ink-dim">
                  {detailedAlbum.services.spotify.copyrights.map((c, i) => (
                    <div key={i}>{c.text}</div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper px-3 py-2.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">
        {label}
      </dt>
      <dd className="mt-1 font-grot text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink">
        {value}
      </dd>
    </div>
  );
}

function IdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-16 shrink-0 uppercase tracking-[0.08em] text-ink-dim">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}