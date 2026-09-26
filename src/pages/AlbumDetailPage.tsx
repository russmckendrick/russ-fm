import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { SiLastdotfm } from 'react-icons/si';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { getCleanGenres, getCleanGenresFromArray } from '@/lib/genreUtils';
import { MusicPlayerSection } from '@/components/MusicPlayerSection';
import { youTubeVideos } from '@/lib/youtube';
import { AlbumScrobbleButton } from '@/components/AlbumScrobbleButton';
import { toScrobbleTracks } from '@/lib/scrobbleTracks';
import { getGenreExplorer, getRelatedAlbumsForAlbum } from '@/lib/genreExplorer';
import { loadCollection, loadDetailJson, useCollection } from '@/lib/collection';
import { getAlbumImageFromData, getAlbumSlug, getArtistImageFromData, getArtistAvatarFromData, getAlbumOGImageUrl, handleImageError } from '@/lib/image-utils';
import { cn } from '@/lib/utils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { useAlbumColors, useAlbumColorMap, useAlbumSwatches } from '@/hooks/useAlbumColors';
import { floodFor } from '@/lib/sleeveColour';
import { originalYear } from '@/lib/releaseYear';
import { appConfig } from '@/config/app.config';
import type { Album as CollectionAlbum, AlbumMember, BoxsetContent, BoxsetLink } from '@/types/album';
import { buildSpotifyTrackIndex, normaliseTrackTitle } from '@/lib/trackMatching';
import { AFTER_HERO, CoverHero, HeroRecord, PillLink, RecordTile, SectionHeading, Vinyl, usePageFlood } from '@/components/player';
import { BoxContents, BoxHeroArt } from '@/components/album/BoxSet';
import { buildBoxDiscs, type BoxTrack } from '@/lib/boxDiscs';

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
  members?: AlbumMember[];
  genre_names: string[];
  uri_release: string;
  uri_artist: string;
  date_added: string;
  date_release_year: string;
  year_original?: number | null;
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
  format_primary?: string | null;
  labels?: string[];
  boxset?: BoxsetLink | null;
  boxset_contents?: BoxsetContent[];
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
    /** "member" marks a band line-up credit; those stay out of the artist sections. */
    role?: string;
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
    perplexity?: {
      description?: string;
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
  const year = (album && originalYear(album)) || detailedAlbum.year;
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
  const original = album ? originalYear(album) : null;
  const released = original ? String(original) : detailedAlbum.released || (detailedAlbum.year ? String(detailedAlbum.year) : undefined);
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
    data.track = (tracks as unknown as Array<Record<string, unknown>>).slice(0, 50).map((track, idx) => {
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
  const { albums: rawCollection, loading } = useCollection();
  const collection = rawCollection as unknown as Album[];
  const album = useMemo(() => findAlbum(collection, albumPath), [collection, albumPath]);
  const [detail, setDetail] = useState<{ path: string; data: DetailedAlbum } | null>(null);
  const detailedAlbum = detail && detail.path === albumPath ? detail.data : null;
  const similarAlbums = useMemo(() => (album ? findSimilarAlbums(collection, album) : []), [collection, album]);

  // Sleeve colours drive the whole page: flood for the hero, ground for the body.
  const palette = useAlbumColors(albumPath ? `/album/${albumPath}/` : undefined);
  const swatches = useAlbumSwatches(albumPath ? `/album/${albumPath}/` : undefined);
  const colourMap = useAlbumColorMap();
  const [scrobbling, setScrobbling] = useState(false);
  const [boxSelected, setBoxSelected] = useState(0);
  const flood = floodFor(palette);
  usePageFlood(
    album ? flood.flood : null,
    album ? flood.ink : null,
    album ? { cover: getAlbumImageFromData(album.uri_release, 'hi-res'), ground: flood.ground } : undefined,
  );

  useEffect(() => {
    setBoxSelected(0);
    setScrobbling(false);
  }, [albumPath]);

  // Check if URL needs sanitization and redirect if necessary
  useEffect(() => {
    const checkAndRedirectAlbumPath = async () => {
      if (albumPath) {
        // Case 1: Pure Discogs ID (like "25472284")
        if (/^\d+$/.test(albumPath)) {
          try {
            // Load collection to find the album with this Discogs ID
            const collection = await loadCollection() as unknown as Album[];

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

  // The collection gives us enough for the hero straight away; the release's
  // detail JSON (tracklist, notes, services) fills in the rest when it lands.
  useEffect(() => {
    if (!album || !albumPath) return;
    let alive = true;
    loadDetailJson<DetailedAlbum>(`/album/${albumPath}/${albumPath}.json`)
      .then(data => {
        // MusicPlayerSection expects an `artist` field.
        if (alive) setDetail({ path: albumPath, data: { ...data, artist: album.release_artist } });
      })
      .catch(error => console.error('Error loading album details:', error));
    return () => {
      alive = false;
    };
  }, [album, albumPath]);

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
    return <div className="h-[80vh] bg-[color:var(--ground)]" aria-busy="true" aria-label="Loading album" />;
  }

  if (!album) {
    return (
      <div className="mx-auto flex w-full max-w-[1640px] flex-col items-start gap-6 px-5 py-24 md:px-10 lg:px-14">
        <p className="t-disp m-0 text-[48px] md:text-[72px]">Album not found</p>
        <PillLink to="/albums/1">All albums</PillLink>
      </div>
    );
  }

  // Original release year (Discogs master); the pressing's own date is in detailedAlbum.released.
  const year = originalYear(album) ?? NaN;

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

  const hasListen = !!(
    detailedAlbum &&
    (detailedAlbum.services?.spotify?.id ||
      detailedAlbum.services?.spotify?.url ||
      detailedAlbum.services?.apple_music?.url ||
      youTubeVideos(detailedAlbum.videos).length > 0)
  );
  const artistsWithBio = (detailedAlbum?.artists ?? []).filter(
    a => a.biography && a.role !== 'member' && a.name.toLowerCase() !== 'various',
  );
  const isBox = !!album.boxset_contents?.length;
  const boxDiscs = isBox ? buildBoxDiscs((tracks as BoxTrack[]) ?? [], album.boxset_contents ?? []) : [];
  const moreByArtist = collection
    .filter(a => a.uri_artist === album.uri_artist && a.uri_release !== album.uri_release && !a.boxset)
    .sort((a, b) => (originalYear(b) ?? 0) - (originalYear(a) ?? 0))
    .slice(0, 12);
  const lastfm = detailedAlbum?.services?.lastfm;
  const accent = flood.glow;
  const title = album.release_name.trim();
  const longest = Math.max(...title.split(/\s+/).map(w => w.length), 6);
  const sides = tracks.length ? groupTracksBySide(tracks) : null;
  const sideCount = sides ? countSides(sides) : 0;
  const totalDuration = calculateTotalDuration(tracks);
  const labelName = detailedAlbum?.labels?.[0];
  const scrobbleArtist = album.release_artist;
  const albumTracksForScrobble = toScrobbleTracks(tracks);
  const discCount = Math.ceil(sideCount / 2);

  const formatDetail = [
    detailedAlbum?.formats?.[0] ?? album.format_primary ?? 'Record',
    sideCount > 2 ? `${discCount} discs` : null,
    sideCount > 1 ? `${sideCount} sides` : null,
  ].filter(Boolean).join(' · ');

  const facts: Array<[string, string]> = [
    ['Label', detailedAlbum?.labels?.join(', ') ?? ''],
    ['Released', Number.isFinite(year) ? String(year) : ''],
    ['This pressing', pressingDate(detailedAlbum, year)],
    ['Country', detailedAlbum?.country ?? ''],
    ['Format', formatDetail],
    ['Added', formatDate(album.date_added)],
    ['Styles', (detailedAlbum?.styles ?? []).slice(0, 3).join(', ')],
  ].filter((f): f is [string, string] => !!f[1]) as Array<[string, string]>;

  const serviceLinks = [
    detailedAlbum?.services?.spotify?.url && { label: 'Spotify', url: detailedAlbum.services.spotify.url },
    detailedAlbum?.services?.apple_music?.url && { label: 'Apple Music', url: detailedAlbum.services.apple_music.url },
    detailedAlbum?.discogs_url && { label: 'Discogs', url: detailedAlbum.discogs_url },
  ].filter(Boolean) as Array<{ label: string; url: string }>;

  const heroText = (
    <div className="flex flex-col gap-5 lg:gap-6">
      {isBox && <span className="t-kicker">Box set</span>}
      <div className="flex flex-wrap items-center gap-3">
        {(album.artists && album.artists.length > 1 ? album.artists : [{ name: album.release_artist, uri_artist: album.uri_artist }]).map((artist, i, all) => (
          <React.Fragment key={artist.uri_artist || artist.name}>
            <Link to={artist.uri_artist} className="inline-flex items-center gap-3">
              <img
                src={getArtistAvatarFromData(artist.uri_artist)}
                alt=""
                onError={handleImageError}
                className="h-10 w-10 rounded-full object-cover md:h-11 md:w-11"
              />
              <span className="t-dispn text-[22px] md:text-[28px]">{artist.name}</span>
            </Link>
            {i < all.length - 1 && <span aria-hidden className="t-mono opacity-60">/</span>}
          </React.Fragment>
        ))}
      </div>
      <h1 className="t-cond m-0" style={{ fontSize: `clamp(48px, ${Math.min(10, 64 / longest)}vw, ${Math.min(120, Math.floor(420 / (longest * 0.52)))}px)` }}>
        {title}
      </h1>
      <div className="t-kicker flex flex-wrap gap-x-4 gap-y-1" style={{ color: flood.sub }}>
        {Number.isFinite(year) && <span>{year}</span>}
        {labelName && <span>{labelName}</span>}
        {isBox ? (
          <span>{boxDiscs.length} albums</span>
        ) : (
          tracks.length > 0 && <span>{sideCount > 1 ? `${sideCount} sides · ` : ''}{tracks.length} tracks</span>
        )}
        {totalDuration && <span>{totalDuration}</span>}
      </div>
      {album.members && album.members.length > 0 && (
        <p className="m-0 text-[14px]" style={{ color: flood.sub }}>
          With{' '}
          {album.members.map((member, index) => (
            <React.Fragment key={member.name}>
              {index > 0 && (index === album.members!.length - 1 ? ' & ' : ', ')}
              {member.uri_artist ? (
                <Link to={member.uri_artist} className="font-bold underline-offset-4 hover:underline">
                  {member.name}
                </Link>
              ) : (
                <span className="font-bold">{member.name}</span>
              )}
            </React.Fragment>
          ))}
        </p>
      )}
      {album.boxset?.uri_release && (
        <Link to={album.boxset.uri_release} className="pill pill-sm self-start">
          From the box set · {album.boxset.name ?? 'View box set'}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
      <div className="mt-1 flex flex-wrap gap-2.5">
        {!isBox && tracks.length > 0 && (
          <AlbumScrobbleButton
            album={{ artist: scrobbleArtist, album: album.release_name, tracks: albumTracksForScrobble }}
            tone={{ background: flood.ink, color: flood.flood }}
            pillSize="lg"
            onActiveChange={setScrobbling}
          />
        )}
        {serviceLinks.map(s => (
          <PillLink key={s.label} to={s.url} size={isBox ? 'md' : 'sm'} className={isBox ? undefined : 'self-center'}>
            {s.label}
          </PillLink>
        ))}
      </div>
      {cleanGenresList.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cleanGenresList.slice(0, 5).map(genre => (
            <Link
              key={genre}
              to={`/albums/1?genre=${encodeURIComponent(genre)}`}
              className="t-mono rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase opacity-80 hover:opacity-100"
              style={{ borderColor: 'currentColor' }}
            >
              {genre}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ background: flood.ground }} className="flood-surface -mb-24 pb-24">
      <CoverHero
        flood={flood}
        art={
          isBox ? (
            <BoxHeroArt
              boxUri={album.uri_release}
              boxTitle={title}
              discs={boxDiscs}
              selected={boxSelected}
              onSelect={setBoxSelected}
              flood={flood}
              added={album.date_added}
            />
          ) : (
            <HeroRecord
              src={getAlbumImageFromData(album.uri_release, 'hi-res')}
              alt={`${title} by ${album.release_artist}`}
              labelColour={flood.ground}
              labelText={`${album.release_artist.toUpperCase()} · SIDE A`}
              discOut={scrobbling ? 34 : 15}
              fast={scrobbling}
              sticker={{ date: album.date_added, background: flood.ground, color: flood.flood }}
            />
          )
        }
      >
        {heroText}
      </CoverHero>

      <div className={cn('mx-auto w-full max-w-[1640px] px-5 md:px-10 lg:px-14', AFTER_HERO)} style={{ color: 'var(--cream)' }}>
        {isBox && (
          <div className="mb-20">
            <BoxContents
              boxUri={album.uri_release}
              discs={boxDiscs}
              selected={boxSelected}
              onSelect={setBoxSelected}
              colours={colourMap}
              boxFlood={flood}
              artist={album.release_artist}
            />
          </div>
        )}

        <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-20">
          <div className="flex min-w-0 flex-col gap-20">
            {description && (
              <section className="flex flex-col gap-6">
                <h2 className="t-disp m-0 text-[34px] md:text-[48px]">{isBox ? 'About this box set' : 'About this record'}</h2>
                <ExpandableBody shouldCollapse={description.length > 900} fade={flood.ground}>
                  <div className="flex flex-col gap-5 text-[18px] leading-[1.65] text-[color:var(--ink-2)] md:text-[19px]">
                    {description.split('\n').filter(p => p.trim()).map((p, i) => (
                      <p key={i} className="m-0">{p.trim()}</p>
                    ))}
                  </div>
                </ExpandableBody>
              </section>
            )}

            {!isBox && sides && tracks.length > 0 && (
              <section className="flex flex-col gap-8">
                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                  <h2 className="t-disp m-0 text-[34px] md:text-[48px]">Tracklist</h2>
                  <span className="t-mono text-[13px] text-[color:var(--cream-dim)]">
                    {tracks.length} tracks{sideCount > 2 ? ` · ${discCount} discs` : ''}{totalDuration ? ` · ${totalDuration}` : ''}
                  </span>
                </div>
                <Tracklist
                  grouping={sides}
                  accent={accent}
                  discColour={flood.flood}
                  spotifyIndex={spotifyTrackIndex}
                  getDuration={getTrackDuration}
                />
              </section>
            )}

            {hasListen && detailedAlbum && (
              <section className="flex flex-col gap-6">
                <h2 className="t-disp m-0 text-[34px] md:text-[48px]">Listen</h2>
                <div className="rounded-[18px] bg-[rgba(0,0,0,.28)] p-4 md:p-6">
                  <MusicPlayerSection album={detailedAlbum} />
                </div>
              </section>
            )}

            {artistsWithBio.map(artist => {
              const artistUri = album.artists?.find(a => a.name === artist.name)?.uri_artist || album.uri_artist;
              let bio = (artist.biography ?? '').replace(/<[^>]*>/g, '').trim();
              const readMore = bio.indexOf('Read more on Last.fm');
              if (readMore !== -1) bio = bio.substring(0, readMore).trim();
              const wiki = bio.indexOf('Full Wikipedia article:');
              if (wiki !== -1) bio = bio.substring(0, wiki).trim();
              const count = collection.filter(a => a.uri_artist === artistUri || a.artists?.some(x => x.uri_artist === artistUri)).length;
              return (
                <section key={artist.name} className="flex flex-col gap-6 rounded-[18px] bg-[rgba(0,0,0,.24)] p-6 md:flex-row md:gap-8 md:p-8">
                  <Link to={artistUri} className="h-32 w-32 shrink-0 overflow-hidden rounded-full md:h-44 md:w-44">
                    <img src={getArtistImageFromData(artistUri, 'medium')} alt={artist.name} onError={handleImageError} className="h-full w-full object-cover" />
                  </Link>
                  <div className="flex min-w-0 flex-col gap-4">
                    <Link to={artistUri} className="t-disp text-[32px] md:text-[44px]">
                      {artist.name}
                    </Link>
                    <ExpandableBody shouldCollapse={bio.length > 600} fade="#141210">
                      <div className="flex flex-col gap-4 text-[16px] leading-[1.65] text-[color:var(--ink-2)] md:text-[17px]">
                        {bio.split('\n').filter(p => p.trim()).map((p, i) => (
                          <p key={i} className="m-0">{p.trim()}</p>
                        ))}
                      </div>
                    </ExpandableBody>
                    <Link to={artistUri} className="inline-flex items-center gap-2 self-start font-bold" style={{ color: accent }}>
                      {count} {count === 1 ? 'record' : 'records'} in the collection
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                </section>
              );
            })}
          </div>

          <aside className="flex flex-col gap-10 lg:sticky lg:top-28 lg:self-start">
            {(lastfm?.listeners || lastfm?.playcount) && (
              <section className="flood-surface flex flex-col gap-4 rounded-[18px] p-6" style={{ background: flood.flood, color: flood.ink }}>
                <span className="t-kicker inline-flex items-center gap-2">
                  <SiLastdotfm className="h-4 w-4" aria-hidden /> Last.fm
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {lastfm?.playcount !== undefined && (
                    <div className="flex flex-col gap-1">
                      <span className="t-cond text-[56px]">{Number(lastfm.playcount).toLocaleString('en-GB')}</span>
                      <span className="t-kicker text-[11px]">Scrobbles</span>
                    </div>
                  )}
                  {lastfm?.listeners !== undefined && (
                    <div className="flex flex-col gap-1">
                      <span className="t-cond text-[56px]">{Number(lastfm.listeners).toLocaleString('en-GB')}</span>
                      <span className="t-kicker text-[11px]">Listeners</span>
                    </div>
                  )}
                </div>
                {lastfm?.url && (
                  <a href={lastfm.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[14px] font-bold">
                    View on Last.fm
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </a>
                )}
              </section>
            )}

            <section>
              <h3 className="t-kicker m-0 mb-2 text-[color:var(--cream-dim)]">Release details</h3>
              <dl className="m-0">
                {facts.map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1.5 border-t py-4" style={{ borderColor: 'var(--cream-rule)' }}>
                    <dt className="t-kicker text-[11px]" style={{ color: accent }}>{k}</dt>
                    <dd className="m-0 text-[16px] font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {(detailedAlbum?.services?.spotify?.external_ids?.upc || detailedAlbum?.discogs_id || detailedAlbum?.spotify_id) && (
              <section>
                <h3 className="t-kicker m-0 mb-2 text-[color:var(--cream-dim)]">Identifiers</h3>
                <dl className="m-0">
                  {[
                    ['UPC', detailedAlbum?.services?.spotify?.external_ids?.upc],
                    ['Discogs', detailedAlbum?.discogs_id ? String(detailedAlbum.discogs_id) : undefined],
                    ['Spotify', detailedAlbum?.spotify_id],
                  ]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-1 border-t py-3" style={{ borderColor: 'var(--cream-rule)' }}>
                        <dt className="t-kicker text-[11px] text-[color:var(--cream-dim)]">{k}</dt>
                        <dd className="t-mono m-0 break-all text-[13px]">{v}</dd>
                      </div>
                    ))}
                </dl>
              </section>
            )}

            {swatches.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="t-kicker m-0 text-[color:var(--cream-dim)]">Sleeve colours</h3>
                {/* Each swatch is as wide as the share of the sleeve it covers. */}
                <div
                  role="img"
                  aria-label={`Sleeve colours: ${swatches.map(([c, share]) => `${c} ${share}%`).join(', ')}`}
                  className="flex h-3.5 overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]"
                >
                  {swatches.map(([c, share]) => (
                    <span key={c} title={`${c} · ${share}%`} style={{ flex: share, background: c }} />
                  ))}
                </div>
                <div className="flex gap-2.5">
                  {[flood.flood, flood.secondary].filter((c): c is string => !!c).map(c => (
                    <span key={c} title={c} className="h-8 w-8 rounded-full shadow-[inset_0_0_0_2px_rgba(0,0,0,.15)]" style={{ background: c }} />
                  ))}
                </div>
              </section>
            )}

            {(detailedAlbum?.services?.spotify?.copyrights?.length || detailedAlbum?.services?.apple_music?.copyright) && (
              <section className="flex flex-col gap-2">
                <h3 className="t-kicker m-0 text-[color:var(--cream-dim)]">Copyright</h3>
                {(detailedAlbum?.services?.spotify?.copyrights?.map(c => c.text) ?? [detailedAlbum?.services?.apple_music?.copyright]).map((c, i) => (
                  <p key={i} className="t-mono m-0 text-[12px] leading-relaxed text-[color:var(--cream-dim)]">{c}</p>
                ))}
              </section>
            )}
          </aside>
        </div>

        {moreByArtist.length > 0 && (
          <section className="mt-24">
            <SectionHeading title={`More by ${album.release_artist}`} link={{ to: album.uri_artist, label: 'Artist page' }} />
            <div className="shelf-scroll -mx-5 mt-2 scroll-px-5 gap-6 px-5 pb-4 pt-6 md:-mx-10 md:scroll-px-10 md:px-10 lg:-mx-14 lg:scroll-px-14 lg:px-14">
              {moreByArtist.map(a => (
                <RecordTile key={a.uri_release} album={a} palette={colourMap?.[a.uri_release]} meta={originalYear(a) ?? undefined} showArtist={false} className="w-[160px] shrink-0 md:w-[190px]" />
              ))}
            </div>
          </section>
        )}

        {similarAlbums.length > 0 && (
          <section className="mt-20">
            <SectionHeading title="Similar albums" />
            <div className="shelf-scroll -mx-5 mt-2 scroll-px-5 gap-6 px-5 pb-4 pt-6 md:-mx-10 md:scroll-px-10 md:px-10 lg:-mx-14 lg:scroll-px-14 lg:px-14">
              {similarAlbums.map(a => (
                <RecordTile key={a.uri_release} album={a} palette={colourMap?.[a.uri_release]} className="w-[160px] shrink-0 md:w-[190px]" />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- helpers -- */

/** Find the release for a URL slug: exact URI first, then by sanitised name + Discogs ID. */
function findAlbum(collection: Album[], albumPath: string | undefined): Album | null {
  if (!albumPath || !collection.length) return null;
  const exact = collection.find(item => item.uri_release === `/album/${albumPath}/`);
  if (exact) return exact;
  const pathMatch = albumPath.match(/^(.+)-(\d+)$/);
  if (!pathMatch) return null;
  const discogsId = pathMatch[2];
  return (
    collection.find(item => {
      if (item.uri_release.match(/(\d+)/)?.[1] !== discogsId) return false;
      return albumPath === `${sanitizeFolderName(item.release_name)}-${discogsId}`;
    }) ?? null
  );
}

const albumsBySlug = new WeakMap<Album[], Map<string, Album>>();

/** Up to ten records that share genres with this one, excluding the same artist. */
function findSimilarAlbums(collection: Album[], album: Album): Album[] {
  const explorer = getGenreExplorer(collection as unknown as CollectionAlbum[]);
  const slug = getAlbumSlug(album.uri_release);
  const explorerAlbum = explorer.allGenre.albums.find(candidate => candidate.slug === slug);
  if (!explorerAlbum) return [];

  let bySlug = albumsBySlug.get(collection);
  if (!bySlug) {
    bySlug = new Map(collection.map(item => [getAlbumSlug(item.uri_release), item]));
    albumsBySlug.set(collection, bySlug);
  }

  const artistUris = new Set([album.uri_artist, ...(album.artists?.map(a => a.uri_artist) ?? [])]);
  const out: Album[] = [];
  for (const { album: related } of getRelatedAlbumsForAlbum(explorerAlbum, explorer.allGenre.albums)) {
    const item = bySlug.get(related.slug);
    if (item && !artistUris.has(item.uri_artist)) out.push(item);
    if (out.length === 10) break;
  }
  return out;
}

type SideGroup = { label: string; tracks: Track[] };
type Grouping = { type: 'lp'; groups: Array<{ lpLabel: string; sides: SideGroup[] }> } | { type: 'flat'; groups: SideGroup[] };

function countSides(grouping: Grouping): number {
  const labels = grouping.type === 'lp' ? grouping.groups.flatMap(g => g.sides.map(s => s.label)) : grouping.groups.map(g => g.label);
  return labels.filter(l => l.startsWith('Side')).length;
}

/** The pressing's own release date, shown only when it isn't the original year. */
function pressingDate(detail: { released?: string; year?: number } | null, original: number): string {
  if (!detail) return '';
  const year = detail.year ?? Number.parseInt(String(detail.released ?? '').slice(0, 4), 10);
  if (!Number.isFinite(year) || year === original) return '';
  return detail.released && detail.released.length >= 7 ? formatDate(detail.released) : String(year);
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function Tracklist({
  grouping,
  accent,
  discColour,
  spotifyIndex,
  getDuration,
}: {
  grouping: Grouping;
  accent: string;
  discColour: string;
  spotifyIndex: Map<string, string>;
  getDuration: (t: Track) => string;
}) {
  const blocks: Array<{ heading?: string; sides: Array<{ label: string; tracks: Track[] }> }> =
    grouping.type === 'lp'
      ? grouping.groups.map(g => ({ heading: g.lpLabel, sides: g.sides }))
      : [{ sides: grouping.groups }];

  return (
    <div className="flex flex-col gap-12">
      {blocks.map((block, bi) => (
        <div key={bi} className="flex flex-col gap-6">
          {block.heading && blocks.length > 1 && <h3 className="t-kicker m-0" style={{ color: accent }}>{block.heading}</h3>}
          <div className="grid gap-x-14 gap-y-12 md:grid-cols-2">
            {block.sides.map((side, si) => {
              const rows = side.tracks.filter(t => t.position || t.duration_ms || t.name);
              return (
                <div key={si} className="flex min-w-0 flex-col gap-3">
                  {side.label && (
                    <div className="flex flex-wrap items-center gap-3.5">
                      <div className="relative h-12 w-12 shrink-0">
                        <Vinyl label={discColour} spin={false} className="inset-0" />
                      </div>
                      <span className="t-disp flex-1 text-[30px] md:text-[36px]">{side.label}</span>
                    </div>
                  )}
                  <ol className="m-0 list-none p-0">
                    {rows.map((track, i) => {
                      const header = !track.position && !track.duration_ms;
                      if (header) {
                        return (
                          <li key={i} className="t-kicker pb-1 pt-4" style={{ color: accent }}>
                            {track.name}
                          </li>
                        );
                      }
                      const spotifyId = spotifyIndex.get(normaliseTrackTitle(track.name));
                      const duration = getDuration(track);
                      return (
                        <li key={i} className="flex items-baseline gap-4 border-b py-3.5 text-[16px] md:text-[17px]" style={{ borderColor: 'var(--cream-rule)' }}>
                          <span className="t-mono w-8 shrink-0 text-[12px] font-bold" style={{ color: accent }}>
                            {track.position || track.track_number || i + 1}
                          </span>
                          <span className="min-w-0 flex-1 font-semibold">
                            {spotifyId ? (
                              <a href={`https://open.spotify.com/track/${spotifyId}`} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline" title="Open on Spotify">
                                {track.name}
                              </a>
                            ) : (
                              track.name
                            )}
                            {track.artists && track.artists.length > 0 && (
                              <span className="ml-2 text-[13px] font-normal text-[color:var(--cream-dim)]">{track.artists.map(a => a.name).join(', ')}</span>
                            )}
                          </span>
                          {duration && <span className="t-mono text-[12px] text-[color:var(--cream-dim)]">{duration}</span>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Collapsible body copy. Clips long text with a fade in the page's ground
 * colour and a "Read more" pill.
 */
function ExpandableBody({ children, shouldCollapse, fade, collapsedMaxHeight = 300 }: { children: React.ReactNode; shouldCollapse: boolean; fade: string; collapsedMaxHeight?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!shouldCollapse) return <>{children}</>;
  return (
    <div>
      <div className="relative overflow-hidden transition-[max-height] duration-500 ease-out" style={{ maxHeight: expanded ? '4000px' : `${collapsedMaxHeight}px` }}>
        {children}
        {!expanded && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28" style={{ background: `linear-gradient(to top, ${fade}, transparent)` }} />}
      </div>
      <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded} className="pill pill-sm mt-4 border-[color:var(--cream-rule)]">
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </div>
  );
}
