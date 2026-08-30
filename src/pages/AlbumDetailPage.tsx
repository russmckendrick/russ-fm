import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { SiSpotify, SiDiscogs, SiApplemusic } from 'react-icons/si';
import { ServiceButton } from '@/components/ui/service-button';
import { EditorialEmpty, EditorialSkeleton, PageContainer, SectionHeader } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { getCleanGenres, getCleanGenresFromArray } from '@/lib/genreUtils';
import { AlbumCard } from '@/components/AlbumCard';
import { MusicPlayerSection } from '@/components/MusicPlayerSection';
import { VideoSection } from '@/components/VideoSection';
import { AlbumScrobbleButton } from '@/components/AlbumScrobbleButton';
import { toScrobbleTracks } from '@/lib/scrobbleTracks';
import { buildGenreExplorer, getRelatedAlbumsForAlbum } from '@/lib/genreExplorer';
import { getAlbumImageFromData, getAlbumSlug, getArtistImageFromData, getArtistAvatarFromData, getAlbumOGImageUrl, handleImageError } from '@/lib/image-utils';
import { cn } from '@/lib/utils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { useAlbumColorsWithFallback } from '@/hooks/useAlbumColors';
import { appConfig } from '@/config/app.config';
import type { Album as CollectionAlbum } from '@/types/album';
import { buildSpotifyTrackIndex, normaliseTrackTitle } from '@/lib/trackMatching';

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

function clipText(text: string | undefined | null, max: number): string {
  if (!text) return '';
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + '…';
}

function buildAlbumDescription(detailedAlbum: DetailedAlbum, album: Album | null): string {
  const title = detailedAlbum.title;
  const artist = album?.release_artist || detailedAlbum.artists?.[0]?.name || 'Unknown Artist';
  const year = detailedAlbum.year;
  const perplexity = detailedAlbum.services?.perplexity?.description;
  if (perplexity) {
    return clipText(`${title} by ${artist} (${year}). ${perplexity}`, 300);
  }
  const genres = (detailedAlbum.genres || []).slice(0, 3).filter(Boolean).join(', ');
  const labels = (detailedAlbum.labels || []).slice(0, 2).filter(Boolean).join(', ');
  const parts = [`${title} by ${artist}`];
  if (year) parts.push(`released ${year}`);
  if (genres) parts.push(genres);
  if (labels) parts.push(`on ${labels}`);
  return clipText(parts.join(' · ') + '.', 300);
}

function isoDuration(ms: number | undefined): string | null {
  if (!Number.isFinite(ms) || !ms || ms <= 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `PT${minutes}M${seconds}S`;
}

function buildAlbumJsonLd({
  detailedAlbum,
  album,
  albumPath,
  canonicalUrl,
  ogImage,
  description,
}: {
  detailedAlbum: DetailedAlbum;
  album: Album | null;
  albumPath: string;
  canonicalUrl: string;
  ogImage: string;
  description: string;
}): object[] {
  const title = detailedAlbum.title;
  const artistName = album?.release_artist || detailedAlbum.artists?.[0]?.name || 'Unknown Artist';
  const artistUri = album?.uri_artist || album?.artists?.[0]?.uri_artist || '';
  const artistSlug = artistUri.replace(/^\/artist\//, '').replace(/\/$/, '');
  const released = detailedAlbum.released || (detailedAlbum.year ? String(detailedAlbum.year) : undefined);
  const genres = Array.from(new Set([
    ...(album?.genre_names || []),
    ...(detailedAlbum.genres || []),
    ...(detailedAlbum.styles || []),
  ])).filter(Boolean);
  const labels = (detailedAlbum.labels || []).filter(Boolean);
  const tracks = Array.isArray(detailedAlbum.tracklist) ? detailedAlbum.tracklist : [];

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'MusicAlbum',
    '@id': canonicalUrl,
    url: canonicalUrl,
    name: title,
    description,
    image: ogImage,
    byArtist: artistSlug
      ? { '@type': 'MusicGroup', name: artistName, url: `${appConfig.siteUrl}/artist/${artistSlug}` }
      : { '@type': 'MusicGroup', name: artistName },
  };
  if (released) data.datePublished = released;
  if (genres.length) data.genre = genres;
  if (labels.length) data.recordLabel = labels.map((name) => ({ '@type': 'Organization', name }));
  if (tracks.length) {
    data.numTracks = tracks.length;
    data.track = tracks.slice(0, 50).map((track: Record<string, unknown>, idx) => {
      const node: Record<string, unknown> = {
        '@type': 'MusicRecording',
        name: (track.title as string) || (track.name as string) || `Track ${idx + 1}`,
        position: (track.position as string) || (track.track_number as number) || idx + 1,
        byArtist: { '@type': 'MusicGroup', name: artistName },
      };
      const duration = isoDuration(track.duration_ms as number | undefined);
      if (duration) node.duration = duration;
      return node;
    });
  }
  const sameAs = Array.from(new Set([
    detailedAlbum.discogs_url,
    detailedAlbum.spotify_url,
  ].filter(Boolean) as string[]));
  if (sameAs.length) data.sameAs = sameAs;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${appConfig.siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Albums', item: `${appConfig.siteUrl}/albums` },
      { '@type': 'ListItem', position: 3, name: title },
    ],
  };

  void albumPath; // canonicalUrl already encodes it
  return [data, breadcrumb];
}

export function AlbumDetailPage() {
  const { albumPath } = useParams<{ albumPath: string }>();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<Album[]>([]);
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
            const collection = await collectionResponse.json() as Album[];

            // Find album by Discogs ID
            const foundAlbum = collection.find((candidate) => {
              const albumDiscogsId = candidate.uri_release.match(/\/(\d+)\//)?.[1];
              return albumDiscogsId === albumPath;
            });

            if (foundAlbum) {
              // Use the hi-res image path to get the actual folder structure
              // The hi-res image path contains the correct sanitized folder name
              const hiResPath = foundAlbum.images_uri_release['hi-res'];
              if (hiResPath) {
                // Extract album path from: "/album/unknown-25472284/unknown-25472284-hi-res.jpg"
                const albumPathMatch = hiResPath.match(/\/album\/([^/]+)\//);
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
    : 'Loading Album… | Russ.fm';

  usePageTitle(pageTitle);

  const canonicalUrl = `${appConfig.siteUrl}/album/${albumPath}`;
  const metaDescription = detailedAlbum
    ? buildAlbumDescription(detailedAlbum, album)
    : 'View album details on Russ.fm';
  const albumJsonLd = detailedAlbum && albumPath
    ? buildAlbumJsonLd({
        detailedAlbum,
        album,
        albumPath,
        canonicalUrl,
        ogImage: getAlbumOGImageUrl(albumPath),
        description: metaDescription,
      })
    : undefined;

  useMetaTags({
    title: pageTitle,
    description: metaDescription,
    image: albumPath ? getAlbumOGImageUrl(albumPath) : undefined,
    url: canonicalUrl,
    type: 'music.album',
    canonical: canonicalUrl,
    jsonLd: albumJsonLd,
  });

  const loadAlbumData = useCallback(async () => {
    try {
      // Load collection to find this specific album
      const collectionResponse = await fetch('/collection.json');
      const collection = await collectionResponse.json() as Album[];
      setCollection(collection);

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
        <EditorialSkeleton label="Loading album…" />
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
          <EditorialEmpty
            title="Album not found"
            detail="The requested album could not be found"
          />
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

  // Index Spotify tracks by normalised title so we can deep-link each row to
  // open.spotify.com/track/<id>. Falls back gracefully when Spotify wasn't
  // matched for the release.
  const spotifyTrackIndex = buildSpotifyTrackIndex(detailedAlbum?.services?.spotify?.tracks);

  const description = (() => {
    let d = getAlbumDescription() || '';
    const i = d.indexOf('Read more on Last.fm');
    if (i !== -1) d = d.substring(0, i).trim();
    return d;
  })();
  const cleanGenresList = detailedAlbum
    ? getCleanGenres({
        genres: [...album.genre_names, ...(detailedAlbum.styles || [])],
        services: detailedAlbum.services,
      })
    : getCleanGenresFromArray(album.genre_names, album.release_artist);

  const heroImage = getAlbumImageFromData(`/album/${albumPath}/`, 'hi-res');
  const albumTint = albumColors.background || 'var(--paper-2)';
  const albumAccent = albumColors.accent || 'var(--hl)';
  const titleStyle = getAlbumHeroTitleStyle(album.release_name);
  const formattedAdded = album.date_added
    ? new Date(album.date_added).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).toUpperCase()
    : '—';
  const primaryFormat = detailedAlbum?.formats?.[0] || 'Record';
  const similarAlbums = (() => {
    if (!collection.length) return [];

    const explorer = buildGenreExplorer(collection as CollectionAlbum[]);
    const albumBySlug = new Map(collection.map((item) => [getAlbumSlug(item.uri_release), item]));
    const explorerAlbum = explorer.allGenre.albums.find((candidate) => candidate.slug === getAlbumSlug(album.uri_release));

    if (!explorerAlbum) return [];

    const artistUris = new Set([
      album.uri_artist,
      ...(album.artists?.map(a => a.uri_artist) ?? []),
    ]);

    return getRelatedAlbumsForAlbum(explorerAlbum, explorer.allGenre.albums)
      .map(({ album: relatedAlbum }) => albumBySlug.get(relatedAlbum.slug))
      .filter((item): item is Album => Boolean(item) && !artistUris.has(item.uri_artist))
      .slice(0, 10);
  })();

  // Boxset members resolved to full collection entries so AlbumCard can render them.
  const boxsetMembers = (() => {
    if (!album.boxset_contents?.length || !collection.length) return [];
    const byUri = new Map(collection.map(item => [item.uri_release, item]));
    return album.boxset_contents
      .map(member => byUri.get(member.uri_release))
      .filter((item): item is Album => Boolean(item));
  })();

  // Section numbering — each section that renders gets the next sequential
  // "01", "02"… so toggled sections stay correctly numbered after the
  // Videos / Artist order swap. Must track the current order: About,
  // Tracklist, In this box set, Listen, About the artist, Videos, Similar albums.
  const hasListen = !!(
    detailedAlbum &&
    (detailedAlbum.services?.spotify?.id ||
      detailedAlbum.services?.spotify?.url ||
      detailedAlbum.services?.apple_music?.url)
  );
  const hasArtistBio = !!(
    detailedAlbum?.artists &&
    detailedAlbum.artists.some(a => a.biography && a.name.toLowerCase() !== 'various')
  );
  const hasVideos = !!(detailedAlbum?.videos && detailedAlbum.videos.length > 0);
  const sectionNums = (() => {
    let n = 0;
    const pad = () => String(++n).padStart(2, '0');
    return {
      about: description ? pad() : '01',
      tracklist: tracks.length > 0 ? pad() : '01',
      boxset: boxsetMembers.length > 0 ? pad() : '01',
      listen: hasListen ? pad() : '01',
      artist: hasArtistBio ? pad() : '01',
      videos: hasVideos ? pad() : '01',
      similar: similarAlbums.length > 0 ? pad() : '01',
    };
  })();

  // Shared action buttons — rendered in the hero on mobile/tablet and in
  // the sidebar above "Release details" on lg+.
  const actionButtons = (
    <>
      <AlbumScrobbleButton
        album={{
          artist: album.release_artist,
          album: album.release_name,
          tracks: toScrobbleTracks(tracks),
        }}
        className="w-full sm:w-auto"
      />
      {detailedAlbum?.services?.apple_music?.url && (
        <ServiceButton
          service="apple-music"
          url={detailedAlbum.services.apple_music.url}
          icon={<SiApplemusic className="h-4 w-4" />}
          className="w-full sm:w-auto"
        >
          Apple Music
        </ServiceButton>
      )}
      {detailedAlbum?.services?.spotify?.url && (
        <ServiceButton
          service="spotify"
          url={detailedAlbum.services.spotify.url}
          icon={<SiSpotify className="h-4 w-4" />}
          className="w-full sm:w-auto"
        >
          Spotify
        </ServiceButton>
      )}
      {detailedAlbum?.discogs_url && (
        <ServiceButton
          service="discogs"
          url={detailedAlbum.discogs_url}
          icon={<SiDiscogs className="h-4 w-4" />}
          className="w-full sm:w-auto"
        >
          Discogs
        </ServiceButton>
      )}
    </>
  );

  return (
    <PageContainer variant="hero">
      {/* Hero ----------------------------------------------------------- */}
      <section
        className={cn(
          'relative isolate overflow-hidden border-b border-rule bg-paper font-grot lg:h-[720px] xl:h-[760px]',
          albumPath ? `album-${albumPath}` : undefined,
        )}
        style={{
          '--album-bg-fallback': albumColors.background,
          '--album-fg-fallback': albumColors.foreground,
          '--album-accent-fallback': albumColors.accent,
          '--album-muted-fallback': albumColors.muted,
        } as React.CSSProperties}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            background: `radial-gradient(circle at 62% 22%, ${albumTint} 0%, transparent 34%)`,
          }}
        />

        <div className="relative mx-auto grid h-full w-full max-w-[1640px] gap-9 px-5 py-10 md:px-8 md:py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)_220px] lg:items-center lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)_260px]">
          <div className="order-2 flex min-w-0 flex-col items-start lg:order-none">
            <nav className="mb-5 flex max-w-full items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              <Link
                to="/albums/1"
                className="shrink-0 transition-colors hover:text-ink"
              >
                Albums
              </Link>
              <span aria-hidden>/</span>
              <span className="min-w-0 truncate">{album.release_name}</span>
            </nav>

            <h1
              className="text-display max-w-full uppercase text-ink lg:max-w-[var(--hero-title-max-width)]"
              style={titleStyle}
            >
              {album.release_name}
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {album.artists && album.artists.length > 1 ? (
                <div className="flex -space-x-2">
                  {album.artists.map((artist) => (
                    <Link
                      key={artist.uri_artist}
                      to={artist.uri_artist}
                      className="shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
                    >
                      <img
                        src={getArtistAvatarFromData(artist.uri_artist)}
                        alt={artist.name}
                        width={40}
                        height={40}
                        onError={handleImageError}
                        className="h-10 w-10 rounded-[6px] border border-rule-strong object-cover"
                      />
                    </Link>
                  ))}
                </div>
              ) : (
                <Link
                  to={album.uri_artist}
                  className="shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
                >
                  <img
                    src={getArtistAvatarFromData(album.uri_artist)}
                    alt={album.release_artist}
                    width={40}
                    height={40}
                    onError={handleImageError}
                    className="h-10 w-10 rounded-[6px] border border-rule-strong object-cover"
                  />
                </Link>
              )}

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-[22px] uppercase leading-none text-ink">
                {album.artists && album.artists.length > 1 ? (
                  album.artists.map((artist, index) => (
                    <React.Fragment key={artist.uri_artist}>
                      <Link
                        to={artist.uri_artist}
                        className="transition-colors hover:text-hl"
                      >
                        {artist.name}
                      </Link>
                      {index < album.artists!.length - 1 && (
                        <span className="font-mono text-[13px] text-ink-dim" aria-hidden>
                          /
                        </span>
                      )}
                    </React.Fragment>
                  ))
                ) : (
                  <Link
                    to={album.uri_artist}
                    className="transition-colors hover:text-hl"
                  >
                    {album.release_artist}
                  </Link>
                )}
              </div>
            </div>

            {cleanGenresList.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {cleanGenresList.slice(0, 6).map((genre) => (
                  <Link
                    key={genre}
                    to={`/albums/1?genre=${encodeURIComponent(genre)}`}
                    className="border border-rule-strong bg-paper px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink transition-[color,background-color,border-color] duration-200 hover:border-hl hover:bg-hl hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {genre}
                  </Link>
                ))}
              </div>
            )}

            {album.boxset && (
              album.boxset.uri_release ? (
                <Link
                  to={album.boxset.uri_release}
                  className="mt-5 inline-flex items-center gap-2 border border-rule-strong bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink transition-colors hover:border-hl hover:bg-hl hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  From the box set · {album.boxset.name ?? 'View box set'} <span aria-hidden>→</span>
                </Link>
              ) : (
                <span className="mt-5 inline-flex items-center gap-2 border border-rule bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim">
                  Part of a box set
                </span>
              )
            )}

            <div className="mt-7 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {actionButtons}
            </div>
          </div>

          <div className="order-1 min-w-0 lg:order-none">
            <div
              className="mx-auto aspect-square w-full max-w-[580px] overflow-hidden bg-paper-2 shadow-[0_28px_70px_-36px_rgba(14,13,11,0.45)]"
              style={{
                boxShadow: `0 38px 90px -48px ${albumAccent}, 0 18px 48px -34px rgba(14,13,11,0.42)`,
              }}
            >
              <img
                src={heroImage}
                onError={handleImageError}
                alt={`${album.release_name} by ${album.release_artist} album cover`}
                width={720}
                height={720}
                fetchPriority="high"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          <aside className="order-3 grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong sm:grid-cols-3 lg:order-none lg:grid-cols-1 lg:gap-0 lg:border-0 lg:bg-transparent">
            <AlbumMetaRail label="Released" value={Number.isFinite(year) ? String(year) : '—'} />
            <AlbumMetaRail label="Format" value={primaryFormat} />
            <AlbumMetaRail label="Added" value={formattedAdded} />
            <AlbumMetaRail
              label="Genres"
              value={cleanGenresList.length ? cleanGenresList.slice(0, 2).join(', ') : 'Collection'}
            />
            <AlbumMetaRail label="Tracks" value={tracks.length ? String(tracks.length) : '—'} />
            <div className="hidden border-b border-rule py-8 lg:block">
              <HeroPulseLine accent={albumAccent} />
            </div>
          </aside>
        </div>
      </section>

      {/* Main content --------------------------------------------------- */}
      <div className="mx-auto w-full max-w-[1640px] px-5 py-14 md:px-8 md:py-20">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-20">
          <div className="flex flex-col gap-16">
            {description && (
              <section>
                <SectionHeader num={sectionNums.about} label="About this record" />
                <div className="mt-6">
                  <ExpandableBody shouldCollapse={description.length > 600}>
                    <div className="font-grot text-[17px] leading-[1.7] text-ink-2">
                      {description.includes('\n') ? (
                        description.split('\n').filter(p => p.trim()).map((p, i) => (
                          <p key={i} className="mb-5 last:mb-0">{p.trim()}</p>
                        ))
                      ) : (
                        <p>{description}</p>
                      )}
                    </div>
                  </ExpandableBody>
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
                const spotifyId = spotifyTrackIndex.get(normaliseTrackTitle(track.name));
                const trackName = spotifyId ? (
                  <a
                    href={`https://open.spotify.com/track/${spotifyId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink underline-offset-4 transition-colors hover:text-hl hover:underline"
                    title="Open on Spotify"
                  >
                    {track.name}
                  </a>
                ) : (
                  track.name
                );
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
                      {trackName}
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
                  <SectionHeader num={sectionNums.tracklist} label="Tracklist" count={tracks.length} />
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

            {boxsetMembers.length > 0 && (
              <section>
                <SectionHeader num={sectionNums.boxset} label="In this box set" count={boxsetMembers.length} />
                <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {boxsetMembers.map((member, i) => (
                    <AlbumCard key={member.uri_release} album={member} index={i + 1} />
                  ))}
                </div>
              </section>
            )}

            {detailedAlbum && (detailedAlbum.services?.spotify?.id || detailedAlbum.services?.spotify?.url || detailedAlbum.services?.apple_music?.url) && (
              <section>
                <SectionHeader
                  num={sectionNums.listen}
                  label={`Listen to ${detailedAlbum.title}`}
                />
                <div className="mt-6 border border-rule-strong bg-paper p-5 md:p-6">
                  <MusicPlayerSection album={detailedAlbum} />
                </div>
              </section>
            )}

            {detailedAlbum?.artists && detailedAlbum.artists.some(a => a.biography && a.name.toLowerCase() !== 'various') && (() => {
              const artistsWithBio = detailedAlbum.artists.filter(
                a => a.biography && a.name.toLowerCase() !== 'various',
              );
              const sectionLabel =
                artistsWithBio.length === 1
                  ? `About ${artistsWithBio[0].name}`
                  : 'About the artists';

              return (
                <section>
                  <SectionHeader num={sectionNums.artist} label={sectionLabel} />
                  <div className="mt-6 flex flex-col gap-12">
                    {detailedAlbum.artists.map((artist, index) => {
                      if (!artist.biography || artist.name.toLowerCase() === 'various') return null;
                      const artistUri = album.artists?.find(a => a.name === artist.name)?.uri_artist || album.uri_artist;
                      let bio = artist.biography.replace(/<[^>]*>/g, '').trim();
                      const readMore = bio.indexOf('Read more on Last.fm');
                      if (readMore !== -1) bio = bio.substring(0, readMore).trim();
                      const wiki = bio.indexOf('Full Wikipedia article:');
                      if (wiki !== -1) bio = bio.substring(0, wiki).trim();

                      const paragraphs = bio.split('\n').filter(p => p.trim());

                      return (
                        <div key={index} className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
                          <div>
                            <img
                              src={getArtistImageFromData(artistUri, 'medium')}
                              alt={artist.name}
                              onError={handleImageError}
                              className="aspect-square w-full rounded-[6px] border border-rule-strong object-cover"
                            />
                          </div>
                          <div>
                            <Link
                              to={artistUri}
                              className="mb-5 inline-flex items-center gap-2 border border-rule-strong bg-paper px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink transition-colors hover:bg-paper-2"
                            >
                              View profile <span aria-hidden>→</span>
                            </Link>
                            <ExpandableBody shouldCollapse={bio.length > 500}>
                              <div className="font-grot text-[16px] leading-[1.7] text-ink-2">
                                {paragraphs.map((p, i) => (
                                  <p key={i} className="mb-4 last:mb-0">{p.trim()}</p>
                                ))}
                              </div>
                            </ExpandableBody>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

            {detailedAlbum?.videos && detailedAlbum.videos.length > 0 && (
              <section>
                <SectionHeader num={sectionNums.videos} label="Videos" count={detailedAlbum.videos.length} />
                <div className="mt-6">
                  <VideoSection videos={detailedAlbum.videos} />
                </div>
              </section>
            )}

            {similarAlbums.length > 0 && (
              <section>
                <SectionHeader num={sectionNums.similar} label="Similar albums" count={similarAlbums.length} />
                <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {similarAlbums.map((album, i) => (
                    <AlbumCard key={album.uri_release} album={album} index={i + 1} />
                  ))}
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

            {(detailedAlbum?.services?.lastfm?.listeners || detailedAlbum?.services?.lastfm?.playcount) && (
              <div>
                <h3 className="mb-3 border-b border-rule pb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dim">
                  Last.fm reach
                </h3>
                <dl className="grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong">
                  {detailedAlbum.services.lastfm.listeners !== undefined && (
                    <KV label="Listeners" value={detailedAlbum.services.lastfm.listeners.toLocaleString()} />
                  )}
                  {detailedAlbum.services.lastfm.playcount !== undefined && (
                    <KV label="Scrobbles" value={detailedAlbum.services.lastfm.playcount.toLocaleString()} />
                  )}
                </dl>
                {detailedAlbum.services.lastfm.url && (
                  <a
                    href={detailedAlbum.services.lastfm.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dim transition-colors hover:text-hl"
                  >
                    View on Last.fm →
                  </a>
                )}
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

/**
 * Collapsible body copy. When the natural content height exceeds
 * `collapsedMaxHeight`, the body clips with a paper-gradient fade and
 * shows a "Read more" toggle beneath. Expanded state reveals the full
 * text with a "Show less" affordance. Used for the About and Artist
 * bio sections — replaces the previous hard-truncate + jump-to-artist
 * pattern.
 */
function ExpandableBody({
  children,
  collapsedMaxHeight = 260,
  shouldCollapse,
  expandLabel = 'Read more',
  collapseLabel = 'Show less',
}: {
  children: React.ReactNode;
  collapsedMaxHeight?: number;
  shouldCollapse: boolean;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!shouldCollapse) {
    return <>{children}</>;
  }

  return (
    <div>
      <div
        className="relative overflow-hidden transition-[max-height] duration-500 ease-out"
        style={{ maxHeight: expanded ? '4000px' : `${collapsedMaxHeight}px` }}
      >
        {children}
        {!expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-paper via-paper to-transparent"
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="mt-4 inline-flex items-center gap-2 border border-rule-strong bg-paper px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink transition-colors hover:bg-paper-2"
      >
        {expanded ? collapseLabel : expandLabel}
        <span
          aria-hidden
          className="inline-block transition-transform duration-300"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
        >
          ↓
        </span>
      </button>
    </div>
  );
}

function AlbumMetaRail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper p-4 lg:border-b lg:border-rule lg:bg-transparent lg:px-0 lg:py-5 lg:last:border-b-0">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </dt>
      <dd className="mt-2 break-words font-display text-[19px] uppercase leading-tight text-ink">
        {value}
      </dd>
    </div>
  );
}

function HeroPulseLine({ accent }: { accent: string }) {
  return (
    <span className="relative block h-10 w-20 overflow-hidden text-ink" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 96 48" fill="none">
        <path
          d="M2 24h12l5-15 9 30 7-23 7 16 7-8h45"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.32"
        />
        <path
          className="waveform-trace"
          d="M2 24h12l5-15 9 30 7-23 7 16 7-8h45"
          stroke={accent}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="1"
          strokeDasharray="0.34 1"
        />
      </svg>
    </span>
  );
}

function getAlbumHeroTitleStyle(title: string): React.CSSProperties {
  const words = title.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);
  const charCount = title.length;

  let maxPx = 128;
  let preferredVw = 9.2;
  let maxWidth = 'min(100%, 9.6ch)';

  if (longestWord >= 18 || charCount >= 46) {
    maxPx = 72;
    preferredVw = 4.9;
    maxWidth = 'min(100%, 13.8ch)';
  } else if (longestWord >= 13 || charCount >= 34) {
    maxPx = 88;
    preferredVw = 5.8;
    maxWidth = 'min(100%, 12.4ch)';
  } else if (longestWord >= 11 || charCount >= 24) {
    maxPx = 104;
    preferredVw = 7.1;
    maxWidth = 'min(100%, 11.2ch)';
  }

  return {
    fontSize: `clamp(48px, ${preferredVw}vw, ${maxPx}px)`,
    '--hero-title-max-width': maxWidth,
    lineHeight: 0.9,
  } as React.CSSProperties;
}

function IdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-16 shrink-0 uppercase tracking-[0.08em] text-ink-dim">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
