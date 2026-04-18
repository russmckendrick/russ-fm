import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SiSpotify, SiApplemusic, SiLastdotfm, SiDiscogs, SiWikipedia } from 'react-icons/si';
import { ServiceButton } from '@/components/ui/service-button';
import { GenreTag } from '@/components/ui/genre-tag';
import { AlbumCard } from '@/components/AlbumCard';
import { PageContainer, SectionHeader } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColors } from '@/hooks/useAlbumColors';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { getArtistImageFromData, getArtistOGImageUrl, handleImageError, sanitizeJsonPath } from '@/lib/image-utils';
import { appConfig } from '@/config/app.config';

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
    spotify?: { id?: string; url?: string; popularity?: number; followers?: { total?: number }; external_urls?: { spotify?: string } };
    apple_music?: { url?: string; id?: string };
    lastfm?: { url?: string; listeners?: number; playcount?: number; bio?: { content?: string; summary?: string } };
    discogs?: { id?: string; url?: string };
  };
  local_images: { 'hi-res': string; medium: string };
}

export function ArtistDetailPage() {
  const { artistPath } = useParams<{ artistPath: string }>();
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
      const collection = await collectionResponse.json();

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
    : 'Loading Artist... | Russ.fm';
  usePageTitle(pageTitle);
  useMetaTags({
    title: pageTitle,
    description: artistData
      ? `${artistData.name}. ${artistData.biography?.substring(0, 200) || 'Explore this artist\'s music collection'}... ${albums.length} album${albums.length !== 1 ? 's' : ''} in collection.`
      : 'View artist details on Russ.fm',
    image: artistPath ? getArtistOGImageUrl(artistPath) : undefined,
    url: `${appConfig.siteUrl}/artist/${artistPath}`,
    type: 'music.musician'
  });

  if (loading) {
    return (
      <PageContainer>
        <div className="py-16 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          Loading artist…
        </div>
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
          <div className="mt-8 border border-rule-strong bg-paper-2/40 px-6 py-16 text-center font-grot">
            <p className="text-[17px] font-semibold text-ink">Artist not found</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
              The requested artist could not be found
            </p>
          </div>
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

  return (
    <PageContainer variant="hero">
      {/* Hero --------------------------------------------------------- */}
      <section
        className="relative isolate overflow-hidden"
        style={{
          backgroundColor: 'var(--paper)',
        }}
      >
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
            <Link to="/artists/1" className="transition-colors hover:text-ink">Artists</Link>
            <span>/</span>
            <span className="text-ink">{artistName}</span>
          </nav>

          <div className="grid gap-10 md:grid-cols-[auto_minmax(0,1fr)] md:items-end md:gap-14">
            {/* Circular portrait */}
            <div className="mx-auto w-52 shrink-0 md:mx-0 md:w-72">
              <div
                className="relative aspect-square w-full overflow-hidden rounded-full border border-rule-strong bg-paper-2"
                style={
                  albumColors
                    ? { boxShadow: `0 40px 80px -30px ${albumColors.background}, 0 8px 20px -6px rgba(14,13,11,0.12)` }
                    : undefined
                }
              >
                <img
                  src={getArtistImageFromData(`/artist/${decodeURIComponent(artistPath || '')}/`, 'hi-res')}
                  alt={artistName}
                  onError={handleImageError}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            {/* Header text */}
            <div className="flex min-w-0 flex-col gap-6">
              <div>
                <div className="mb-4 flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
                  <span className="text-hl">ARTIST</span>
                  <span>·</span>
                  <span>{albums.length} RELEASE{albums.length === 1 ? '' : 'S'}</span>
                  {firstYear && latestYear && (
                    <>
                      <span>·</span>
                      <span>
                        {firstYear === latestYear ? firstYear : `${firstYear}–${latestYear}`}
                      </span>
                    </>
                  )}
                </div>
                <h1 className="text-[clamp(40px,7vw,88px)] font-semibold leading-[0.98] tracking-[-0.025em] text-ink">
                  {artistName}
                </h1>
              </div>

              {/* KV strip */}
              <dl className="grid max-w-xl grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong font-grot">
                <KV label="Releases" value={String(albums.length)} />
                {firstYear && <KV label="First" value={String(firstYear)} />}
                {artistData?.country && <KV label="Country" value={artistData.country} />}
                {artistData?.formed_date && <KV label="Formed" value={artistData.formed_date} />}
              </dl>

              {cleanGenres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {cleanGenres.slice(0, 6).map((g) => (
                    <GenreTag key={g} genre={g} size="md" linkable />
                  ))}
                </div>
              )}

              {/* External service buttons */}
              <div className="flex flex-wrap gap-2">
                {artistData?.services?.spotify?.url && (
                  <ServiceButton service="spotify" url={artistData.services.spotify.url} icon={<SiSpotify className="h-4 w-4" />}>
                    Spotify
                  </ServiceButton>
                )}
                {artistData?.services?.apple_music?.url && (
                  <ServiceButton service="apple-music" url={artistData.services.apple_music.url} icon={<SiApplemusic className="h-4 w-4" />}>
                    Apple Music
                  </ServiceButton>
                )}
                {artistData?.services?.lastfm?.url && (
                  <ServiceButton service="lastfm" url={artistData.services.lastfm.url} icon={<SiLastdotfm className="h-4 w-4" />}>
                    Last.fm
                  </ServiceButton>
                )}
                {(artistData?.discogs_url || artistData?.services?.discogs?.url) && (
                  <ServiceButton
                    service="discogs"
                    url={artistData?.discogs_url || artistData?.services?.discogs?.url}
                    icon={<SiDiscogs className="h-4 w-4" />}
                  >
                    Discogs
                  </ServiceButton>
                )}
                <ServiceButton
                  service="wikipedia"
                  url={`https://en.wikipedia.org/wiki/${encodeURIComponent(artistName)}`}
                  icon={<SiWikipedia className="h-4 w-4" />}
                >
                  Wikipedia
                </ServiceButton>
              </div>
            </div>
          </div>
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
