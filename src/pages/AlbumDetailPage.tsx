import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Waypoints } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useGlassBand } from '@/hooks/useGlassBand';
import { GLASS_TONE } from '@/lib/glassBand';
import { useMetaTags } from '@/hooks/useMetaTags';
import { getCleanGenres, getCleanGenresFromArray } from '@/lib/genreUtils';
import { slugify } from '@/lib/browseFacets';
import { labelNames } from '@/lib/releaseLabel';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { MusicPlayerSection } from '@/components/MusicPlayerSection';
import { youTubeVideos } from '@/lib/youtube';
import { AlbumScrobbleButton } from '@/components/AlbumScrobbleButton';
import { scrobbleableRows, toScrobbleTracks } from '@/lib/scrobbleTracks';
import { CLOUD_LEAD_IN_MS, cloudTrackMs, useScrobbleScene } from '@/hooks/useScrobbleScene';
import { getGenreExplorer, getRelatedAlbumsForAlbum } from '@/lib/genreExplorer';
import { loadCollection, loadDetailJson, useCollection } from '@/lib/collection';
import { getAlbumImageFromData, getAlbumSlug, getArtistAvatarFromData, getAlbumOGImageUrl, handleImageError } from '@/lib/image-utils';
import { cn } from '@/lib/utils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { useAlbumColors, useAlbumColorMap, useAlbumSwatches } from '@/hooks/useAlbumColors';
import { floodFor } from '@/lib/sleeveColour';
import { originalYear } from '@/lib/releaseYear';
import { appConfig } from '@/config/app.config';
import type { Album as CollectionAlbum, AlbumMember, BoxsetContent, BoxsetLink } from '@/types/album';
import { buildSpotifyTrackIndex, normaliseTrackTitle } from '@/lib/trackMatching';
import { threadFromAlbum } from '@/lib/explore/links';
import { AFTER_HERO, CoverHero, FitTitle, PillLink, RecordTile, SectionHeading, Vinyl, usePageFlood } from '@/components/player';
import { serviceIconFor } from '@/components/player/service-icon';
import { ReleaseRoom } from '@/components/album/ReleaseRoom';
import { ScrobbleSky } from '@/components/album/ScrobbleSky';
import { ReleaseLabel } from '@/components/album/ReleaseLabel';
import { ExpandableBody, LinerNotes } from '@/components/player/LinerNotes';
import { ArtistBand } from '@/components/album/ArtistBand';
import { releaseRoomFor } from '@/lib/releaseRooms';
import { discLooks, entryDiscColours, lookAt, pressingDiscs, pressingTitle, vinylLook, type VinylLook } from '@/lib/vinylLook';
import { BoxContents, BoxHeroArt } from '@/components/album/BoxSet';
import { boxMemberDiscs, buildBoxDiscs, type BoxTrack } from '@/lib/boxDiscs';
import { isHeadingRow, isSuiteRow, sideRuntime, sidingPosition, vinylSide } from '@/lib/tracklistRows';
import { CompilationFaces } from '@/components/various/CompilationFaces';
import { useCompilations } from '@/components/various/useCompilations';
import { VARIOUS_NAME, isCompilation, isVarious, linkedArtists, trackArtistPage } from '@/lib/compilations';

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
  styles?: string[];
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
  vinyl_colours?: string[];
  labels?: string[];
  boxset?: BoxsetLink | null;
  boxset_contents?: BoxsetContent[];
}

interface Track {
  track_number: number;
  name: string;
  duration_ms?: number;
  position?: string;
  /** "heading" or "index" (a suite); plain tracks have none. See lib/tracklistRows. */
  type?: string;
  /** The suite a movement belongs to. */
  parent?: string;
  artists?: Array<{
    name: string;
    discogs_id?: string;
    spotify_id?: string;
  }>;
}

/** One Discogs format entry (a disc set) from the album JSON's `format_details`. */
interface FormatEntry {
  name: string;
  qty?: string;
  descriptions?: string[];
  text?: string | null;
  colour?: string | null;
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
  vinyl_colours?: string[];
  /** One entry per disc set; `colour` is the disc's derived pressing colour. */
  format_details?: FormatEntry[];
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
  // A compilation's track artists, linked to their pages (compilations.json).
  const compilations = useCompilations(!!album && isCompilation(album));

  // Sleeve colours drive the whole page: flood for the hero, ground for the body.
  const palette = useAlbumColors(albumPath ? `/album/${albumPath}/` : undefined);
  const swatches = useAlbumSwatches(albumPath ? `/album/${albumPath}/` : undefined);
  const colourMap = useAlbumColorMap();
  const { scene: scrobbleScene, onProgress: onScrobbleProgress } = useScrobbleScene(albumPath);
  const [boxSelected, setBoxSelected] = useState(0);
  const flood = floodFor(palette);
  // A boxset member links to the album's ordinary Discogs release, which is usually black; its
  // colour lives on the box. The box's detail JSON (cached) says which of its discs are this album's.
  const parentBox = useMemo(
    () => (album?.boxset?.uri_release ? collection.find(a => a.uri_release === album.boxset!.uri_release) ?? null : null),
    [collection, album],
  );
  const [boxDetail, setBoxDetail] = useState<{ uri: string; data: DetailedAlbum } | null>(null);
  useEffect(() => {
    if (!parentBox?.json_detailed_release) return;
    let alive = true;
    loadDetailJson<DetailedAlbum>(parentBox.json_detailed_release)
      .then(data => {
        if (alive) setBoxDetail({ uri: parentBox.uri_release, data });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [parentBox]);
  const inheritedDiscs = useMemo(() => {
    if (!album || !parentBox || boxDetail?.uri !== parentBox.uri_release) return [];
    const map = boxMemberDiscs(boxDetail.data.tracklist ?? [], boxDetail.data.format_details, parentBox.boxset_contents ?? []);
    return map.get(album.uri_release) ?? [];
  }, [album, parentBox, boxDetail]);

  // The pressing's colour per disc: the hero fans them out, each tracklist side takes its LP's,
  // and the logo and footer follow the first. The release's own colours win over the box's.
  const vinylColours = detailedAlbum?.vinyl_colours ?? album?.vinyl_colours ?? [];
  const ownDiscs = pressingDiscs(detailedAlbum?.format_details, vinylColours);
  const inherited = ownDiscs.length ? [] : inheritedDiscs;
  const discs = ownDiscs.length ? ownDiscs : inherited;
  const looks = discLooks(discs);
  usePageFlood(
    album ? flood.flood : null,
    album ? flood.ink : null,
    // Albums open on a listening room (box sets keep the cover hero), with the header see-through over it.
    album ? { cover: getAlbumImageFromData(album.uri_release, 'hi-res'), ground: flood.ground, vinyl: discs[0], room: !album.boxset_contents?.length } : undefined,
  );

  useEffect(() => {
    setBoxSelected(0);
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
      ? album.artists.map(artist => (isVarious(artist.name) ? VARIOUS_NAME : artist.name)).join(' & ')
      : isVarious(album?.release_artist) ? VARIOUS_NAME : album?.release_artist || 'Unknown Artist'
    } | Russ.fm`
    : 'Loading Album… | Russ.fm';

  usePageTitle(pageTitle);
  const [bandRef, bandInset] = useGlassBand<HTMLElement>();

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

  // The Perplexity description when there is one; otherwise the longest of
  // Apple Music's editorial notes and the Last.fm wiki.
  const getAlbumDescription = () => {
    const perplexity = cleanDescription(detailedAlbum?.services?.perplexity?.description ?? '');
    if (perplexity) return perplexity;

    const candidates: (string | undefined | null)[] = [
      detailedAlbum?.services?.apple_music?.raw_attributes?.editorialNotes?.short,
      detailedAlbum?.services?.apple_music?.raw_attributes?.editorialNotes?.standard,
      detailedAlbum?.services?.apple_music?.editorial_notes,
      detailedAlbum?.services?.lastfm?.wiki_summary,
      detailedAlbum?.services?.lastfm?.wiki_content,
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
    // Suites ("2112") are position-less too, but they're songs, not sections.
    const hasSectionHeaders = trackList.some((track, index) => {
      const isHeader = isHeadingRow(track) && track.name;
      const nextTrack = trackList[index + 1];
      const nextHasPosition = nextTrack && (nextTrack.position || nextTrack.duration_ms || isSuiteRow(nextTrack));
      return isHeader && nextHasPosition;
    });

    // The position each row sides by: a movement's base ("A-I" → "A"), a suite its first movement's.
    const sidingPositions = trackList.map((_, index) => sidingPosition(trackList, index));

    // Check if tracks have vinyl-style positions (A1, B1, etc.)
    const hasVinylPositions = sidingPositions.some(position => vinylSide(position));

    if (hasSectionHeaders) {
      // Box set format: use section headers as group labels
      const lpGroups: LPGroup[] = [];
      let currentLp: LPGroup | null = null;
      let currentSide: SideGroup | null = null;
      let currentSideKey = '';

      trackList.forEach((track, index) => {
        const isHeader = isHeadingRow(track) && track.name;

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
          const sideKey = vinylSide(sidingPositions[index]);

          if (hasVinylPositions && sideKey) {

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

    trackList.forEach((track, index) => {
      const position = sidingPositions[index];
      let sideKey = '';
      const side = vinylSide(position);

      if (side) {
        // Vinyl format: A1, B2, etc.
        sideKey = side;
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

          let lpGroup = lpGroups.find(lp => lp.lpLabel === `LP${lpNumber}`);
          if (!lpGroup) {
            lpGroup = { lpLabel: `LP${lpNumber}`, sides: [] };
            lpGroups.push(lpGroup);
          }
          // The side's own letter (C, D on the second LP), as on the label and in the rows' positions.
          lpGroup.sides.push({ label: `Side ${side.sideKey}`, tracks: side.tracks });
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
    // A suite counts once: by its movements when they're timed, otherwise by its own length.
    const timedSuites = new Set(trackList.filter(t => t.parent && t.duration_ms).map(t => t.parent));
    const totalMs = trackList.reduce((sum, track) => {
      if (isSuiteRow(track) && timedSuites.has(track.name)) return sum;
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
          type: track.type,
          parent: track.parent,
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
  // Which of the box's own coloured discs each member album is.
  const boxMembers =
    isBox && detailedAlbum ? boxMemberDiscs(detailedAlbum.tracklist ?? [], detailedAlbum.format_details, album.boxset_contents ?? []) : undefined;
  const moreByArtist = collection
    .filter(a => a.uri_artist === album.uri_artist && a.uri_release !== album.uri_release && !a.boxset)
    .sort((a, b) => (originalYear(b) ?? 0) - (originalYear(a) ?? 0))
    .slice(0, 12);
  const accent = flood.glow;
  const title = album.release_name.trim();
  const longest = Math.max(...title.split(/\s+/).map(w => w.length), 6);
  const sides = tracks.length ? groupTracksBySide(tracks) : null;
  const sideCount = sides ? countSides(sides) : 0;
  const totalDuration = calculateTotalDuration(tracks);
  const labelName = detailedAlbum?.labels?.[0];
  const scrobbleArtist = album.release_artist;
  const albumTracksForScrobble = toScrobbleTracks(tracks);
  const scrobbleRows = scrobbleableRows(tracks);
  const scenePhase = scrobbleScene.phase;
  const showScrobbleReadout = !isBox && (scenePhase === 'lift' || scenePhase === 'play' || scenePhase === 'done');
  const nowRow = scrobbleRows[Math.min(scrobbleScene.done, scrobbleRows.length - 1)];
  const discCount = Math.ceil(sideCount / 2);

  // The Format line names each colour once; a box member lists the colours it has in the box.
  const discColours = [...new Set(discs.filter((c): c is string => !!c))];
  const formatDetail = [
    // A member linked to a CD release still has vinyl in the box.
    (inherited.length ? 'Vinyl' : null) ?? detailedAlbum?.formats?.[0] ?? album.format_primary ?? 'Record',
    discColours.length ? discColours.join(' & ') : null,
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

  // Every detail the page holds, listed under the centre label in the sidebar
  // (the label only fits five, and the hero's line keeps to a few). Each value
  // links wherever the site has a page for it.
  // The genre facet's terms for this record (getCleanGenreTermsFromAlbum's rule, on the page's own album shape).
  const genreSlugs = new Set(getCleanGenresFromArray([...(album.genre_names ?? []), ...(album.styles ?? [])], album.release_artist).map(slugify));
  const rawLabels = [...(album.labels ?? []), ...(detailedAlbum?.labels ?? [])];
  const rawLabel = (name: string) => rawLabels.find(l => l.replace(/\s*\(\d+\)$/, '').trim() === name) ?? name;
  const linkList = (names: string[], href: (name: string) => string | null) =>
    names.map((name, i) => {
      const to = href(name);
      return (
        <React.Fragment key={name}>
          {i > 0 && ', '}
          {to ? <DetailLink to={to}>{name}</DetailLink> : name}
        </React.Fragment>
      );
    });
  const formatName = (inherited.length ? 'Vinyl' : null) ?? detailedAlbum?.formats?.[0] ?? album.format_primary ?? 'Record';
  const addedPage = album.boxset ? null : albumsPageOf(rawCollection, album.uri_release);
  const origYear = originalYear(album);
  const detailRows: Array<[string, React.ReactNode]> = [
    // Each Discogs label once (catalogue entries repeat them), shown without its
    // "(2)" but linked by the full name, as the /label pages slug it.
    ['Label', detailedAlbum?.labels?.length ? linkList(labelNames(detailedAlbum.labels), name => `/label/${slugify(rawLabel(name))}`) : null],
    [
      'Format',
      <>
        {album.format_primary ? <DetailLink to={`/albums/1?format=${encodeURIComponent(album.format_primary)}`}>{formatName}</DetailLink> : formatName}
        {discColours.length > 0 && (
          <>
            {' · '}
            <DetailLink to="/coloured-vinyl">{discColours.join(' & ')}</DetailLink>
          </>
        )}
      </>,
    ],
    ['Discs', discCount > 1 ? String(discCount) : null],
    ['Sides', sideCount > 1 ? String(sideCount) : null],
    ['Tracks', scrobbleRows.length ? <DetailLink to="#tracklist">{scrobbleRows.length}</DetailLink> : null],
    ['Running time', totalDuration ? <DetailLink to="#tracklist">{totalDuration}</DetailLink> : null],
    ['Released', origYear ? <DetailLink to={`/albums/1?year=${origYear}`}>{origYear}</DetailLink> : Number.isFinite(year) ? String(year) : null],
    ['This pressing', pressingDate(detailedAlbum, year) || null],
    ['Country', detailedAlbum?.country ? <DetailLink to={`/country/${slugify(detailedAlbum.country)}`}>{detailedAlbum.country}</DetailLink> : null],
    ['Genres', album.genre_names?.length ? linkList(album.genre_names, name => (genreSlugs.has(slugify(name)) ? `/genre/${slugify(name)}` : null)) : null],
    ['Styles', detailedAlbum?.styles?.length ? linkList(detailedAlbum.styles, name => (genreSlugs.has(slugify(name)) ? `/genre/${slugify(name)}` : null)) : null],
    ['Added', addedPage ? <DetailLink to={`/albums/${addedPage}`}>{formatDate(album.date_added)}</DetailLink> : formatDate(album.date_added)],
  ];
  const allDetails = detailRows.filter(([, v]) => v != null && v !== '');

  const serviceLinks = [
    detailedAlbum?.services?.spotify?.url && { label: 'Spotify', url: detailedAlbum.services.spotify.url },
    detailedAlbum?.services?.apple_music?.url && { label: 'Apple Music', url: detailedAlbum.services.apple_music.url },
    detailedAlbum?.discogs_url && { label: 'Discogs', url: detailedAlbum.discogs_url },
  ].filter(Boolean) as Array<{ label: string; url: string }>;

  // The hero's parts: the box set's cover hero and every other record's room band share them.
  const artistLine = (
    <div className="flex flex-wrap items-center gap-3">
      {(album.artists && album.artists.length > 1 ? album.artists : [{ name: album.release_artist, uri_artist: album.uri_artist }]).map((artist, i, all) => (
        <React.Fragment key={artist.uri_artist || artist.name}>
          {isVarious(artist.name) ? (
            // A compilation: the faces of who plays on it, and how many do.
            <Link to={artist.uri_artist} className="inline-flex items-center gap-3">
              <CompilationFaces artists={linkedArtists(compilations, album.uri_release)} ring={flood.flood} className="max-sm:hidden" />
              <span className="flex flex-col">
                <span className="t-dispn whitespace-nowrap text-[22px] md:text-[28px]">{VARIOUS_NAME}</span>
                {compilations?.releases[album.uri_release] && (
                  <span className="t-mono text-[11px] uppercase" style={{ color: flood.sub }}>
                    {compilations.releases[album.uri_release].artists} artists
                  </span>
                )}
              </span>
            </Link>
          ) : (
            <Link to={artist.uri_artist} className="inline-flex items-center gap-3">
              <img
                src={getArtistAvatarFromData(artist.uri_artist)}
                alt=""
                onError={handleImageError}
                className="h-10 w-10 rounded-full object-cover max-sm:hidden md:h-11 md:w-11"
              />
              <span className="t-dispn text-[22px] md:text-[28px]">{artist.name}</span>
            </Link>
          )}
          {i < all.length - 1 && <span aria-hidden className="t-mono opacity-60">/</span>}
        </React.Fragment>
      ))}
    </div>
  );
  const heroNotes = (
    <>
      {album.members && album.members.length > 0 && (
        <p className={cn('m-0 text-[14px]', !isBox && 'glass-sub')} style={isBox ? { color: flood.sub } : undefined}>
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
        <Link to={album.boxset.uri_release} className="pill self-start">
          From the box set · {album.boxset.name ?? 'View box set'}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </>
  );
  const scrobbleButton = !isBox && tracks.length > 0 && (
    <AlbumScrobbleButton
      album={{ artist: scrobbleArtist, album: album.release_name, tracks: albumTracksForScrobble }}
      tone={isBox ? { background: flood.ink, color: flood.flood } : GLASS_TONE}
      mobileLabel="Scrobble"
      key={albumPath}
      onProgress={onScrobbleProgress}
      leadInMs={CLOUD_LEAD_IN_MS}
      trackMs={cloudTrackMs(scrobbleRows.length)}
    />
  );
  // The scrobble's progress while it plays, else the genres.
  const readout = showScrobbleReadout ? (
      <div className="scrobble-readout flex min-h-[30px] items-baseline gap-3.5" aria-live="polite">
        <span className="t-kicker">{scenePhase === 'done' ? 'Done' : 'Now'}</span>
        <span className="t-dispn truncate text-[17px] md:text-[20px]">
          {scenePhase === 'done'
            ? scrobbleScene.successful === scrobbleScene.total
              ? `All ${scrobbleScene.total} tracks scrobbled`
              : `${scrobbleScene.successful} of ${scrobbleScene.total} tracks scrobbled`
            : nowRow
              ? `${nowRow.position ? `${nowRow.position}  ` : ''}${nowRow.name}`
              : ''}
        </span>
      </div>
    ) : cleanGenresList.length > 0 && (
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
    );

  const heroText = (
    <div className="flex flex-col gap-2.5 sm:gap-5 lg:gap-6">
      {isBox && <span className="t-kicker">Box set</span>}
      {artistLine}
      <h1 className="t-cond m-0" style={{ fontSize: `clamp(48px, ${Math.min(10, 64 / longest)}vw, ${Math.min(120, Math.floor(420 / (longest * 0.52)))}px)` }}>
        {title}
      </h1>
      <div className="t-kicker flex flex-wrap gap-x-4 gap-y-1" style={{ color: flood.sub }}>
        {Number.isFinite(year) && <span>{year}</span>}
        {labelName && <span>{labelName}</span>}
        {isBox ? (
          <span>{boxDiscs.length} albums</span>
        ) : (
          scrobbleRows.length > 0 && <span>{sideCount > 1 ? `${sideCount} sides · ` : ''}{scrobbleRows.length} tracks</span>
        )}
        {totalDuration && <span>{totalDuration}</span>}
        {isBox && album.date_added && <span>Added {formatDate(album.date_added)}</span>}
      </div>
      {heroNotes}
      <div className="pill-row-compact mt-1 flex flex-wrap gap-2.5">
        {scrobbleButton}
        {serviceLinks.map(s => (
          <PillLink key={s.label} to={s.url} iconOnlyOnMobile>
            {s.label}
          </PillLink>
        ))}
        <Link to={threadFromAlbum(album.uri_release)} className="pill" title="Follow the links from this record in The Thread">
          <Waypoints className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="max-sm:hidden">Follow the thread</span>
          <span className="sm:hidden">Thread</span>
        </Link>
      </div>
      {readout}
    </div>
  );

  // Every other record: the room, then one band in the sleeve's flood with the
  // credit on the left and the actions (scrobble, the services, the thread) on the right.
  const pressingLine = [
    detailedAlbum?.formats?.[0] ?? album.format_primary,
    discCount > 1 ? `${discCount} discs` : null,
    discColours.length ? discColours.join(' & ') : null,
    labelName,
    Number.isFinite(year) ? String(year) : null,
    album.date_added ? `Added ${formatDate(album.date_added)}` : null,
  ].filter(Boolean).join(' · ');
  const bandArtists = album.artists && album.artists.length > 1 ? album.artists : [{ name: album.release_artist, uri_artist: album.uri_artist }];
  const roomHero = !isBox && (
    <>
      {/* Pulled up under the sticky header (64px, 84px from md), which is see-through here. */}
      <div className="relative -mt-16 md:-mt-[84px]">
        <ReleaseRoom
          records={[
            {
              key: album.uri_release,
              room: releaseRoomFor(album),
              cover: getAlbumImageFromData(album.uri_release, 'hi-res'),
              alt: `${title} by ${album.release_artist}`,
              look: looks[0] ?? null,
              labelColour: flood.ground,
            },
          ]}
          active={0}
          tint={flood.flood}
          overlay={room => (
            <ScrobbleSky
              scene={scrobbleScene}
              tracks={scrobbleRows}
              width={room.width}
              height={room.height}
              origin={room.record}
              ceiling={room.top}
              tint={flood.flood}
            />
          )}
          bottomInset={bandInset}
          className="h-[clamp(460px,78svh,940px)] lg:h-[clamp(620px,96svh,1100px)]"
        />
      {/* The credit sits on the room itself, on glass: no band of its own. */}
      <section ref={bandRef} className="glass-band" style={{ '--band-tint': flood.flood } as React.CSSProperties}>
        <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-4 px-5 pb-5 md:flex-row md:items-center md:gap-10 md:px-10 lg:px-14">
          <div className="min-w-0 flex-1">
            <p className="glass-sub t-mono m-0 text-[10px] uppercase leading-[1.5] tracking-[0.08em] md:text-[11px]">
              {pressingLine}
            </p>
            <div className="room-title-box">
              <FitTitle key={albumPath} max={96} min={20} fitHeight className="t-cond whitespace-nowrap leading-[0.9]">
                {title}
              </FitTitle>
            </div>
            <p className="m-0 flex min-w-0 items-baseline gap-x-3 truncate">
              {bandArtists.map((artist, i) => (
                <React.Fragment key={artist.uri_artist || artist.name}>
                  {i > 0 && <span aria-hidden className="t-mono opacity-60">/</span>}
                  <Link to={artist.uri_artist} className="t-dispn shrink-0 text-[18px] hover:underline md:text-[22px]">
                    {isVarious(artist.name) ? VARIOUS_NAME : artist.name}
                  </Link>
                </React.Fragment>
              ))}
              <span className="t-mono truncate text-[11px] uppercase opacity-80 md:text-[12px]" aria-live="polite">
                {showScrobbleReadout
                  ? scenePhase === 'done'
                    ? scrobbleScene.successful === scrobbleScene.total
                      ? `All ${scrobbleScene.total} tracks scrobbled`
                      : `${scrobbleScene.successful} of ${scrobbleScene.total} tracks scrobbled`
                    : nowRow
                      ? `Now · ${nowRow.position ? `${nowRow.position} ` : ''}${nowRow.name}`
                      : ''
                  : cleanGenresList.slice(0, 3).join(' · ')}
              </span>
            </p>
            {heroNotes}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            {scrobbleButton}
            {serviceLinks.map(s => {
              const Brand = serviceIconFor(s.url);
              return (
                <a
                  key={s.label}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="icon-btn h-11 w-11 border-2 border-current"
                  aria-label={s.label}
                  title={s.label}
                >
                  {Brand ? <Brand className="h-5 w-5" aria-hidden /> : <ArrowUpRight className="h-5 w-5" aria-hidden />}
                </a>
              );
            })}
            <Link
              to={threadFromAlbum(album.uri_release)}
              className="icon-btn h-11 w-11 border-2 border-current"
              aria-label="Follow the thread"
              title="Follow the links from this record in The Thread"
            >
              <Waypoints className="h-5 w-5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
      </div>
    </>
  );

  return (
    <div style={{ background: flood.ground }} className="flood-surface -mb-24 pb-24">
      {isBox ? (
        <CoverHero
          flood={flood}
          splitAt="md"
          art={
            <BoxHeroArt
              boxUri={album.uri_release}
              boxTitle={title}
              discs={boxDiscs}
              selected={boxSelected}
              onSelect={setBoxSelected}
              flood={flood}
            />
          }
        >
          {heroText}
        </CoverHero>
      ) : (
        roomHero
      )}

      <div className={cn('mx-auto w-full max-w-[1640px] px-5 md:px-10 lg:px-14', isBox ? AFTER_HERO : 'pt-16 lg:pt-24')} style={{ color: 'var(--cream)' }}>
        {isBox && (
          <div className="mb-20">
            <BoxContents
              boxUri={album.uri_release}
              discs={boxDiscs}
              selected={boxSelected}
              onSelect={setBoxSelected}
              colours={colourMap}
              memberDiscs={boxMembers}
              boxFlood={flood}
              artist={album.release_artist}
            />
          </div>
        )}

        {/* Sidebar only from xl: at lg (iPad portrait) a 340px column squeezes the
            main copy to half the width. Below xl the aside sits under the main
            column and flows into two balanced columns from md. */}
        <div className="grid gap-16 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-20">
          <div className="flex min-w-0 flex-col gap-20">
            {description && (
              <section className="flex flex-col gap-6">
                {/* The lede opens the section; the heading is kept for screen readers and the outline only. */}
                <h2 className="sr-only">{isBox ? 'About this box set' : 'About this record'}</h2>
                <ExpandableBody fade={flood.ground} collapsedMaxHeight={460} spare={280}>
                  <LinerNotes text={description} />
                </ExpandableBody>
              </section>
            )}

            {!isBox && sides && tracks.length > 0 && (
              <section id="tracklist" className="flex scroll-mt-28 flex-col gap-8">
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
                  looks={looks}
                  spotifyIndex={spotifyTrackIndex}
                  getDuration={getTrackDuration}
                  artistPage={name => trackArtistPage(compilations, album.uri_release, name)}
                />
              </section>
            )}

            {hasListen && detailedAlbum && (
              <section className="flex flex-col gap-6">
                <h2 className="t-disp m-0 text-[34px] md:text-[48px]">Listen</h2>
                <div className="rounded-[18px] bg-[rgba(0,0,0,.28)] p-4 md:p-6">
                  <MusicPlayerSection album={detailedAlbum} tvAlbum={album as unknown as CollectionAlbum} />
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
                <ArtistBand
                  key={artist.name}
                  name={artist.name}
                  uriArtist={artistUri}
                  count={count}
                  flood={flood.flood}
                  accent={accent}
                  bio={
                    <ExpandableBody fade={flood.ground}>
                      <div className="flex flex-col gap-4 text-[16px] leading-[1.65] text-[color:var(--ink-2)] md:text-[17px]">
                        {bio.split('\n').filter(p => p.trim()).map((p, i) => (
                          <p key={i} className="m-0">{p.trim()}</p>
                        ))}
                      </div>
                    </ExpandableBody>
                  }
                />
              );
            })}
          </div>

          <aside className="flex flex-col gap-10 md:block md:columns-2 md:gap-12 md:[&>*]:mb-10 md:[&>*]:break-inside-avoid xl:flex xl:columns-auto xl:[&>*]:mb-0 xl:sticky xl:top-28 xl:self-start">
            <section>
              <h3 className="t-kicker m-0 mb-4 text-[color:var(--cream-dim)]">Release details</h3>
              {/* Printed on a centre label: the record company over the top, the format under it. */}
              <ReleaseLabel
                labels={detailedAlbum?.labels ?? []}
                format={facts.find(([k]) => k === 'Format')?.[1]}
                artist={album.release_artist}
                title={album.release_name}
                facts={facts.filter(([k]) => k !== 'Label' && k !== 'Format')}
                paper={flood.flood}
                ink={flood.ink}
                look={lookAt(looks, 0)}
                describe={false}
              />
              <dl className="m-0 mt-6">
                {allDetails.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-6 border-t py-2.5" style={{ borderColor: 'var(--cream-rule)' }}>
                    <dt className="t-kicker shrink-0 text-[11px] text-[color:var(--cream-dim)]">{k}</dt>
                    <dd className="m-0 text-right text-[14px]">{v}</dd>
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

            {!isBox && inherited.length > 0 && parentBox ? (
              <Pressing
                formats={[]}
                discColour={flood.flood}
                fromBox={{ discs: inherited, name: parentBox.release_name, uri: parentBox.uri_release }}
              />
            ) : (
              !isBox && detailedAlbum?.format_details && <Pressing formats={detailedAlbum.format_details} discColour={flood.flood} />
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

/** /albums in its default order (newest added first), cached per collection. */
const addedOrder = new WeakMap<object, Map<string, number>>();

/** The /albums page (default sort, no filters) that lists the record, or null. */
function albumsPageOf(collection: CollectionAlbum[], uri: string): number | null {
  let order = addedOrder.get(collection);
  if (!order) {
    const listed = [...excludeBoxsetMembers(collection)].sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime());
    order = new Map(listed.map((a, i) => [a.uri_release, i]));
    addedOrder.set(collection, order);
  }
  const i = order.get(uri);
  return i === undefined ? null : Math.floor(i / appConfig.pagination.itemsPerPage.albums) + 1;
}

/** A linked value in the sidebar's release details. */
function DetailLink({ to, children }: { to: string; children: React.ReactNode }) {
  const className = 'underline decoration-[color:var(--cream-rule)] decoration-1 underline-offset-4 transition-colors hover:decoration-current';
  return to.startsWith('#') ? (
    <a href={to} className={className}>
      {children}
    </a>
  ) : (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * The pressing, from the Discogs format entries: each vinyl disc set as a little record in its
 * own colour with what Discogs says about it (LP, 180 gram, gatefold…), other formats as plain
 * rows, and the edition tags (limited edition, remastered…) that apply to the whole release.
 */
function Pressing({
  formats,
  discColour,
  fromBox,
}: {
  formats: FormatEntry[];
  discColour: string;
  /** A boxset member showing the discs it has in the box instead of its own release's formats. */
  fromBox?: { discs: Array<string | null>; name: string; uri: string };
}) {
  // A member's discs, runs of the same colour as one row ("2 discs").
  const boxRows: FormatEntry[] = [];
  for (const colour of fromBox?.discs ?? []) {
    const last = boxRows[boxRows.length - 1];
    if (last && last.colour === colour) last.qty = String(Number(last.qty) + 1);
    else boxRows.push({ name: 'Vinyl', qty: '1', colour, text: colour, descriptions: [] });
  }
  const rows = fromBox ? boxRows : formats.filter(f => f.name !== 'All Media');
  const edition = fromBox ? [] : [...new Set(formats.filter(f => f.name === 'All Media').flatMap(f => f.descriptions ?? []))];
  if (!rows.length && !edition.length) return null;
  return (
    <section className="flex flex-col gap-4">
      <h3 className="t-kicker m-0 text-[color:var(--cream-dim)]">Pressing</h3>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {rows.map((f, i) => {
          const vinyl = f.name === 'Vinyl';
          const qty = Math.max(1, parseInt(f.qty ?? '1', 10) || 1);
          const { title, extras } = vinyl ? pressingTitle(f.text, f.colour, qty) : { title: f.name, extras: [] as string[] };
          const meta = [qty > 1 ? `${qty} discs` : null, ...(f.descriptions ?? []), ...extras].filter(Boolean).join(' · ');
          return (
            <li key={i} className="flex items-center gap-3.5">
              {vinyl && (
                <div className="relative h-11 w-11 shrink-0">
                  <Vinyl label={discColour} look={vinylLook(entryDiscColours(f).find(Boolean) ?? null)} spin={false} className="inset-0" />
                </div>
              )}
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[16px] font-semibold leading-tight">{title}</span>
                {meta && <span className="t-mono text-[12px] leading-snug text-[color:var(--cream-dim)]">{meta}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {fromBox && (
        <p className="t-mono m-0 text-[12px] leading-snug text-[color:var(--cream-dim)]">
          From the{' '}
          <Link to={fromBox.uri} className="underline underline-offset-4 hover:text-[color:var(--cream)]">
            {fromBox.name}
          </Link>{' '}
          box set
        </p>
      )}
      {edition.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {edition.map(tag => (
            <span
              key={tag}
              className="t-mono rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--cream-dim)]"
              style={{ borderColor: 'var(--cream-rule)' }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Tracklist({
  grouping,
  accent,
  discColour,
  looks,
  spotifyIndex,
  getDuration,
  artistPage,
}: {
  grouping: Grouping;
  accent: string;
  discColour: string;
  /** The look of each disc, so each side's little record matches its LP. */
  looks: Array<VinylLook | null>;
  spotifyIndex: Map<string, string>;
  getDuration: (t: Track) => string;
  /** A track artist's page (on a compilation), if they have one. */
  artistPage: (name: string) => string | null;
}) {
  type Side = { label: string; tracks: Track[]; title?: string };
  let blocks: Array<{ heading?: string; sides: Side[] }> =
    grouping.type === 'lp'
      ? grouping.groups.map(g => ({ heading: g.lpLabel, sides: g.sides }))
      : [{ sides: grouping.groups }];
  // Named sides (Hounds Of Love / The Ninth Wave) and the discs of a CD set come as
  // one side per heading. Each would sit alone in a half-empty row, so they share
  // one grid instead, each side under its own name.
  if (blocks.length > 1 && blocks.every(b => b.sides.length === 1)) {
    blocks = [{ sides: blocks.map(b => ({ ...b.sides[0], title: b.heading })) }];
  }

  return (
    <div className="flex flex-col gap-14">
      {blocks.map((block, bi) => (
        <div key={bi} className="flex flex-col gap-6">
          {block.heading && blocks.length > 1 && (
            <h3 className="m-0 flex items-center gap-3.5">
              {/* The disc itself, in its pressing colour: the only record in the tracklist. */}
              {/^(LP|Disc)\s*\d+$/.test(block.heading) && (
                <span className="relative block h-9 w-9 shrink-0" aria-hidden>
                  <Vinyl label={discColour} look={lookAt(looks, bi)} spin={false} className="vinyl-lit inset-0" />
                </span>
              )}
              <span className="t-disp text-[20px] md:text-[22px]">{block.heading.replace(/^(LP|Disc)\s*(\d+)$/, '$1 $2')}</span>
              <span className="h-px flex-1" style={{ background: 'var(--cream-rule)' }} aria-hidden />
            </h3>
          )}
          <div className="grid gap-x-14 gap-y-12 md:grid-cols-2">
            {block.sides.map((side, si) => (
              <TracklistSide
                key={si}
                side={side}
                accent={accent}
                spotifyIndex={spotifyIndex}
                getDuration={getDuration}
                artistPage={artistPage}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A side's running time: m:ss, or h:mm:ss for a long CD. */
function sideTime(ms: number) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * One side of the tracklist, set like the back of a sleeve: the side's letter large
 * in the page accent with its running time opposite, over a rule, then the rows with
 * dot leaders out to each track's time.
 */
function TracklistSide({
  side,
  accent,
  spotifyIndex,
  getDuration,
  artistPage,
}: {
  /** `title` is the side's own name ("The Ninth Wave"), set over its letter. */
  side: { label: string; tracks: Track[]; title?: string };
  accent: string;
  spotifyIndex: Map<string, string>;
  getDuration: (t: Track) => string;
  artistPage: (name: string) => string | null;
}) {
  const rows = side.tracks.filter(t => t.position || t.duration_ms || t.name);
  const { totalMs } = sideRuntime(rows);
  const trackCount = rows.filter(t => !isSuiteRow(t) && !isHeadingRow(t)).length;
  // "Side C" → the word small, the letter large.
  const [, word, letter] = /^(\S+)\s+(\S+)$/.exec(side.label) ?? [null, '', side.label];

  return (
    <div className="flex min-w-0 flex-col gap-3" style={{ '--tl-accent': accent } as React.CSSProperties}>
      {side.title && <h3 className="t-disp m-0 text-[20px] leading-tight md:text-[24px]">{side.title.replace(/^(LP|Disc)\s*(\d+)$/, '$1 $2')}</h3>}
      {side.label && (
        <div className="tl-side">
          <h4 className="m-0 flex items-baseline gap-3">
            {word && <span className="t-kicker text-[12px] text-[color:var(--cream-dim)]">{word}</span>}
            <span className="t-disp text-[52px] leading-[0.8] md:text-[64px]" style={{ color: accent }}>{letter}</span>
          </h4>
          <span className="flex items-baseline gap-2.5">
            {totalMs > 0 && <span className="t-dispn text-[22px] tabular-nums md:text-[26px]">{sideTime(totalMs)}</span>}
            <span className="t-mono text-[11px] uppercase text-[color:var(--cream-dim)]">{trackCount} {trackCount === 1 ? 'track' : 'tracks'}</span>
          </span>
        </div>
      )}
      <ol className="m-0 list-none p-0">
        {rows.map((track, i) => {
          if (isSuiteRow(track)) {
            // A suite heads its movements, which follow it with their own positions.
            const duration = getDuration(track);
            return (
              <li key={i} className="flex items-baseline gap-4 px-2 pb-1 pt-4">
                <span className="t-kicker flex-1" style={{ color: accent }}>{track.name}</span>
                {duration && <span className="t-mono text-[12px] text-[color:var(--cream-dim)]">{duration}</span>}
              </li>
            );
          }
          if (isHeadingRow(track)) {
            return (
              <li key={i} className="t-kicker px-2 pb-1 pt-4" style={{ color: accent }}>
                {track.name}
              </li>
            );
          }
          const spotifyId = spotifyIndex.get(normaliseTrackTitle(track.name));
          const duration = getDuration(track);
          return (
            <li key={i} className="tl-track text-[16px] md:text-[17px]">
              <span className="tl-pos t-mono text-[12px] font-bold">{track.position || track.track_number || i + 1}</span>
              <span className="min-w-0 font-semibold">
                {spotifyId ? (
                  <a href={`https://open.spotify.com/track/${spotifyId}`} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline" title="Open on Spotify">
                    {track.name}
                  </a>
                ) : (
                  track.name
                )}
                {track.artists && track.artists.length > 0 && (
                  <span className="ml-2 text-[13px] font-normal text-[color:var(--cream-dim)]">
                    {track.artists.map((a, j) => {
                      const page = artistPage(a.name);
                      return (
                        <React.Fragment key={`${a.name}-${j}`}>
                          {j > 0 && ', '}
                          {page ? (
                            <Link to={page} className="underline decoration-1 underline-offset-4 hover:text-[color:var(--cream)]">
                              {a.name}
                            </Link>
                          ) : (
                            a.name
                          )}
                        </React.Fragment>
                      );
                    })}
                  </span>
                )}
              </span>
              <span className="tl-leader" aria-hidden />
              {duration && <span className="t-mono text-[12px] tabular-nums text-[color:var(--cream-dim)]">{duration}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
