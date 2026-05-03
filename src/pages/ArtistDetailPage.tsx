import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SiSpotify, SiApplemusic, SiLastdotfm, SiDiscogs, SiWikipedia } from 'react-icons/si';
import { ServiceButton } from '@/components/ui/service-button';
import { GenreTag } from '@/components/ui/genre-tag';
import { AlbumCard } from '@/components/AlbumCard';
import { ArtistCard } from '@/components/ArtistCard';
import { EditorialEmpty, EditorialSkeleton, PageContainer, SectionHeader } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColors } from '@/hooks/useAlbumColors';
import { buildGenreExplorer, getRelatedArtistsForArtist, resolveArtist } from '@/lib/genreExplorer';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { getArtistImageFromData, getArtistOGImageUrl, handleImageError, sanitizeJsonPath } from '@/lib/image-utils';
import { appConfig } from '@/config/app.config';
import type { Album as CollectionAlbum } from '@/types/album';

interface Album {
  release_name: string;
  release_artist: string;
  artists?: Array<{
    name: string;
    uri_artist: string;
    json_detailed_artist: string;
    images_uri_artist: { 'hi-res': string; medium: string };
  }>;
  genre_names: string[];
  uri_release: string;
  uri_artist: string;
  date_added: string;
  date_release_year: string;
  json_detailed_release: string;
  json_detailed_artist: string;
  images_uri_release: { 'hi-res': string; medium: string };
  images_uri_artist: { 'hi-res': string; medium: string };
}

interface ArtistImageEntry {
  type?: string;
  url?: string;
  width?: number;
  height?: number;
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
  wikipedia_url?: string | null;
  images?: ArtistImageEntry[];
  services?: {
    spotify?: { id?: string; url?: string; popularity?: number; followers?: { total?: number }; external_urls?: { spotify?: string } };
    apple_music?: { url?: string; id?: string };
    lastfm?: {
      url?: string;
      listeners?: number;
      playcount?: number;
      bio?: { content?: string; summary?: string };
      similar_artists?: Array<{ name: string; url?: string }>;
    };
    discogs?: { id?: string; url?: string };
  };
  local_images: { 'hi-res': string; medium: string };
}

export function ArtistDetailPage() {
  const { artistPath } = useParams<{ artistPath: string }>();
  const [collection, setCollection] = useState<Album[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artistData, setArtistData] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(true);

  // Palette sourced from a random album so the hero gets a per-artist tint
  const randomAlbum = useMemo(() => {
    if (albums.length === 0) return null;
    return albums[Math.floor(Math.random() * albums.length)];
  }, [albums]);
  const randomAlbumPath = randomAlbum?.uri_release.replace('/album/', '').replace('/', '') || '';
  const albumColors = useAlbumColors(randomAlbumPath);

  const loadArtistData = useCallback(async () => {
    try {
      const collectionResponse = await fetch('/collection.json');
      const collection = await collectionResponse.json() as Album[];
      setCollection(collection);

      const decodedArtistPath = decodeURIComponent(artistPath || '');
      const targetUri = `/artist/${decodedArtistPath}/`;

      const artistAlbums = collection.filter((album: Album) => {
        if (album.uri_artist === targetUri) return true;
        const albumArtistPath = album.uri_artist.replace('/artist/', '').replace('/', '');
        if (decodedArtistPath === sanitizeFolderName(albumArtistPath)) return true;
        if (album.artists?.some(a => {
          if (a.uri_artist === targetUri) return true;
          const p = a.uri_artist.replace('/artist/', '').replace('/', '');
          return decodedArtistPath === sanitizeFolderName(p);
        })) return true;
        if (decodedArtistPath === sanitizeFolderName(album.release_artist)) return true;
        return false;
      });

      setAlbums(artistAlbums);

      if (artistAlbums.length > 0) {
        try {
          let artistJsonUrl: string | null = null;
          for (const album of artistAlbums) {
            if (album.artists) {
              const found = album.artists.find(a => {
                if (a.uri_artist === targetUri) return true;
                const p = a.uri_artist.replace('/artist/', '').replace('/', '');
                return decodedArtistPath === sanitizeFolderName(p);
              });
              if (found) { artistJsonUrl = found.json_detailed_artist; break; }
            }
          }
          if (!artistJsonUrl) {
            for (const album of artistAlbums) {
              const p = album.uri_artist.replace('/artist/', '').replace('/', '');
              if (decodedArtistPath === sanitizeFolderName(p)) { artistJsonUrl = album.json_detailed_artist; break; }
            }
          }
          if (!artistJsonUrl) artistJsonUrl = artistAlbums[0].json_detailed_artist;

          const artistDetailResponse = await fetch(sanitizeJsonPath(artistJsonUrl));
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

  useEffect(() => { loadArtistData(); }, [artistPath, loadArtistData]);

  const pageTitle = artistData
    ? `${artistData.name} - ${albums.length} Album${albums.length !== 1 ? 's' : ''} | Russ.fm`
    : 'Loading Artist… | Russ.fm';
  usePageTitle(pageTitle);
  useMetaTags({
    title: pageTitle,
    description: artistData
      ? `${artistData.name}. ${artistData.biography?.substring(0, 200) || 'Explore this artist\'s music collection'}… ${albums.length} album${albums.length !== 1 ? 's' : ''} in collection.`
      : 'View artist details on Russ.fm',
    image: artistPath ? getArtistOGImageUrl(artistPath) : undefined,
    url: `${appConfig.siteUrl}/artist/${artistPath}`,
    type: 'music.musician'
  });

  if (loading) {
    return (
      <PageContainer>
        <EditorialSkeleton label="Loading artist…" />
      </PageContainer>
    );
  }

  if (albums.length === 0) {
    return (
      <PageContainer>
        <div className="py-16">
          <Link to="/artists/1" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim hover:text-ink">
            ← Artists
          </Link>
          <EditorialEmpty
            title="Artist not found"
            detail="The requested artist could not be found"
          />
        </div>
      </PageContainer>
    );
  }

  const artist = albums[0];
  const artistName = (() => {
    if (artistData?.name) return artistData.name;
    const decoded = decodeURIComponent(artistPath || '');
    const targetUri = `/artist/${decoded}/`;
    for (const album of albums) {
      if (album.artists) {
        const found = album.artists.find(a => a.uri_artist === targetUri);
        if (found) return found.name;
      }
    }
    return artist.release_artist;
  })();

  const allGenres = [...new Set(albums.flatMap(a => a.genre_names))];
  const cleanGenres = getCleanGenresFromArray(allGenres, artistName);
  const sortedAlbums = [...albums].sort(
    (a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime()
  );
  const years = sortedAlbums
    .map(a => new Date(a.date_release_year).getFullYear())
    .filter(y => Number.isFinite(y));
  const firstYear = years.length ? Math.min(...years) : null;
  const latestYear = years.length ? Math.max(...years) : null;
  const bio = cleanBiography(artistData?.biography);

  const heroTint = albumColors?.background ?? 'var(--paper-2)';
  const heroAccent = albumColors?.accent ?? 'var(--hl)';
  const titleStyle = getArtistHeroTitleStyle(artistName);
  const fanartUrl = pickFanart(artistData?.images);
  const wikipediaUrl =
    artistData?.wikipedia_url ||
    `https://en.wikipedia.org/wiki/${encodeURIComponent(artistName)}`;
  const lastfmSimilarNames = (artistData?.services?.lastfm?.similar_artists || []).map((s) => s.name.toLowerCase());

  const similarArtists = (() => {
    if (!collection.length) return [];

    const explorer = buildGenreExplorer(collection as CollectionAlbum[]);
    const selectedArtist =
      resolveArtist(explorer.allGenre, artistPath) ||
      explorer.allGenre.artists.find((candidate) => candidate.name.toLowerCase() === artistName.toLowerCase());

    if (!selectedArtist) return [];

    // The genreExplorer caches `artist.avatar` (the smallest variant), but
    // ArtistCard renders at 360×360 so we look the medium variant up at the
    // call site rather than mutating the explorer for every other consumer.
    const candidates = getRelatedArtistsForArtist(selectedArtist, explorer.genres).map(({ artist }) => ({
      name: artist.name,
      uri: artist.uri,
      image: getArtistImageFromData(artist.uri, 'medium'),
      albumCount: artist.totalAlbumCount || artist.albumCount,
    }));

    // If Last.fm gave us a similar list, prefer artists in the collection that
    // appear there. Anything Last.fm names we don't own falls through to the
    // genre-overlap candidates below it.
    if (lastfmSimilarNames.length > 0) {
      const lastfmRanked = candidates.filter((c) => lastfmSimilarNames.includes(c.name.toLowerCase()));
      const remaining = candidates.filter((c) => !lastfmSimilarNames.includes(c.name.toLowerCase()));
      return [...lastfmRanked, ...remaining].slice(0, 6);
    }

    return candidates.slice(0, 6);
  })();

  return (
    <PageContainer variant="hero">
      {/* Hero --------------------------------------------------------- */}
      <section
        className="relative isolate overflow-hidden border-b border-rule bg-paper font-grot lg:h-[720px] xl:h-[760px]"
      >
        {fanartUrl && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {/* Multiply darkens the cream paper in light mode so the fanart
                reads like a tinted backdrop. In dark mode multiply against
                near-black would crush the image to nothing, so swap to
                screen which lifts the colours instead. */}
            <img
              src={fanartUrl}
              alt=""
              className="h-full w-full object-cover opacity-30 mix-blend-multiply dark:opacity-40 dark:mix-blend-screen"
              loading="lazy"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, color-mix(in srgb, var(--paper) 45%, transparent) 0%, color-mix(in srgb, var(--paper) 92%, transparent) 80%)',
              }}
            />
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            background: `radial-gradient(circle at 62% 22%, ${heroTint} 0%, transparent 34%)`,
          }}
        />

        <div className="relative mx-auto grid h-full w-full max-w-[1640px] gap-9 px-5 py-10 md:px-8 md:py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)_220px] lg:items-center lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)_260px]">
          <div className="order-2 flex min-w-0 flex-col items-start lg:order-none">
            <nav className="mb-5 flex max-w-full items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              <Link
                to="/artists/1"
                className="shrink-0 transition-colors hover:text-ink"
              >
                Artists
              </Link>
              <span aria-hidden>/</span>
              <span className="min-w-0 truncate">{artistName}</span>
            </nav>

            <h1
              className="text-display max-w-full uppercase text-ink lg:max-w-[var(--hero-title-max-width)]"
              style={titleStyle}
            >
              {artistName}
            </h1>

            {cleanGenres.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {cleanGenres.slice(0, 6).map((g) => (
                  <GenreTag key={g} genre={g} size="md" linkable />
                ))}
              </div>
            )}

            <div className="mt-7 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {artistData?.services?.spotify?.url && (
                <ServiceButton service="spotify" url={artistData.services.spotify.url} icon={<SiSpotify className="h-4 w-4" />} className="w-full sm:w-auto">
                  Spotify
                </ServiceButton>
              )}
              {artistData?.services?.apple_music?.url && (
                <ServiceButton service="apple-music" url={artistData.services.apple_music.url} icon={<SiApplemusic className="h-4 w-4" />} className="w-full sm:w-auto">
                  Apple Music
                </ServiceButton>
              )}
              {artistData?.services?.lastfm?.url && (
                <ServiceButton service="lastfm" url={artistData.services.lastfm.url} icon={<SiLastdotfm className="h-4 w-4" />} className="w-full sm:w-auto">
                  Last.fm
                </ServiceButton>
              )}
              {(artistData?.discogs_url || artistData?.services?.discogs?.url) && (
                <ServiceButton
                  service="discogs"
                  url={artistData?.discogs_url || artistData?.services?.discogs?.url}
                  icon={<SiDiscogs className="h-4 w-4" />}
                  className="w-full sm:w-auto"
                >
                  Discogs
                </ServiceButton>
              )}
              <ServiceButton
                service="wikipedia"
                url={wikipediaUrl}
                icon={<SiWikipedia className="h-4 w-4" />}
                className="w-full sm:w-auto"
              >
                Wikipedia
              </ServiceButton>
            </div>
          </div>

          <div className="order-1 min-w-0 lg:order-none">
            <div
              className="mx-auto aspect-square w-full max-w-[580px] overflow-hidden bg-paper-2 shadow-[0_28px_70px_-36px_rgba(14,13,11,0.45)]"
              style={{
                boxShadow: `0 38px 90px -48px ${heroAccent}, 0 18px 48px -34px rgba(14,13,11,0.42)`,
              }}
            >
              <img
                src={getArtistImageFromData(`/artist/${decodeURIComponent(artistPath || '')}/`, 'hi-res')}
                alt={artistName}
                width={720}
                height={720}
                fetchPriority="high"
                onError={handleImageError}
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          <aside className="order-3 grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong sm:grid-cols-3 lg:order-none lg:grid-cols-1 lg:gap-0 lg:border-0 lg:bg-transparent">
            <ArtistMetaRail label="Releases" value={String(albums.length)} />
            <ArtistMetaRail label="First" value={firstYear ? String(firstYear) : '—'} />
            <ArtistMetaRail label="Latest" value={latestYear ? String(latestYear) : '—'} />
            <ArtistMetaRail label="Styles" value={cleanGenres.length ? cleanGenres.slice(0, 2).join(', ') : 'Collection'} />
            <div className="hidden border-b border-rule py-8 lg:block">
              <HeroPulseLine accent={heroAccent} />
            </div>
          </aside>
          </div>
      </section>

      {/* Main content ------------------------------------------------- */}
      <div className="mx-auto w-full max-w-[1640px] px-5 py-14 md:px-8 md:py-20">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-20">
          <div className="flex flex-col gap-16">
            {bio && (
              <section>
                <SectionHeader num="01" label="Biography" />
                <div className="mt-6 font-grot text-[16px] leading-[1.7] text-ink-2">
                  {bio.split('\n').filter(p => p.trim()).map((p, i) => (
                    <p key={i} className="mb-5 last:mb-0">{p.trim()}</p>
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionHeader
                num={bio ? '02' : '01'}
                label="Releases in collection"
                count={albums.length}
              />
              <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {sortedAlbums.map((album, i) => (
                  <AlbumCard key={album.uri_release} album={album} index={i + 1} />
                ))}
              </div>
            </section>

            {similarArtists.length > 0 && (
              <section>
                <SectionHeader
                  num={bio ? '03' : '02'}
                  label="Similar artists"
                  count={similarArtists.length}
                />
                <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                  {similarArtists.map((artist, i) => (
                    <ArtistCard key={artist.uri} artist={artist} index={i + 1} />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="flex flex-col gap-8 font-grot lg:sticky lg:top-24 lg:self-start">
            <div>
              <h3 className="mb-3 border-b border-rule pb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dim">
                Quick facts
              </h3>
              <dl className="grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong">
                <KV label="Releases" value={String(albums.length)} />
                {firstYear && <KV label="First" value={String(firstYear)} />}
                {latestYear && <KV label="Latest" value={String(latestYear)} />}
                {artistData?.country && <KV label="Country" value={artistData.country} />}
                {artistData?.formed_date && <KV label="Formed" value={artistData.formed_date} />}
                {artistData?.services?.spotify?.followers?.total != null && (
                  <KV label="Followers" value={numberShort(artistData.services.spotify.followers.total)} />
                )}
                {artistData?.services?.lastfm?.listeners != null && (
                  <KV label="Listeners" value={numberShort(Number(artistData.services.lastfm.listeners))} />
                )}
                {artistData?.services?.lastfm?.playcount != null && (
                  <KV label="Scrobbles" value={numberShort(Number(artistData.services.lastfm.playcount))} />
                )}
              </dl>
            </div>

            {cleanGenres.length > 0 && (
              <div>
                <h3 className="mb-3 border-b border-rule pb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dim">
                  Genres
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {cleanGenres.map((g) => (
                    <GenreTag key={g} genre={g} size="sm" linkable />
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

function ArtistMetaRail({ label, value }: { label: string; value: string }) {
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

function getArtistHeroTitleStyle(name: string): CSSProperties {
  const words = name.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);
  const charCount = name.length;

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
  } as CSSProperties;
}

function cleanBiography(raw?: string): string | null {
  if (!raw) return null;
  let bio = raw.replace(/<[^>]*>/g, '').trim();
  const readMore = bio.indexOf('Read more on Last.fm');
  if (readMore !== -1) bio = bio.substring(0, readMore).trim();
  const wiki = bio.indexOf('Full Wikipedia article:');
  if (wiki !== -1) bio = bio.substring(0, wiki).trim();
  return bio || null;
}

function numberShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// Pick the widest TheAudioDB fanart image from the artist's images list. Returns
// undefined when no fanart was matched (sparse artists fall back to the regular
// portrait-only hero treatment).
function pickFanart(images: ArtistImageEntry[] | undefined): string | undefined {
  if (!images?.length) return undefined;
  const fanart = images
    .filter((img) => img?.url && img.type?.toLowerCase() === 'fanart')
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return fanart[0]?.url;
}
