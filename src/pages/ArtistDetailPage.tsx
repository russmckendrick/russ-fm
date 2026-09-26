import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArtistCard } from '@/components/ArtistCard';
import { FitTitle, PillLink, RecordTile, SectionHeading, bandFromFlood, recordsFlood, usePageFlood } from '@/components/player';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { useBackdropTone } from '@/hooks/useBackdropTone';
import { getGenreExplorer, getRelatedArtistsForArtist, resolveArtist } from '@/lib/genreExplorer';
import { loadDetailJson, useCollection } from '@/lib/collection';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { slugify } from '@/lib/browseFacets';
import { floodFor, INK } from '@/lib/sleeveColour';
import { originalYear } from '@/lib/releaseYear';
import { cn } from '@/lib/utils';
import { getAlbumImageFromData, getArtistAvatarFromData, getArtistImageFromData, getArtistOGImageUrl, handleImageError } from '@/lib/image-utils';
import { appConfig } from '@/config/app.config';
import type { Album as CollectionAlbum, AlbumMember } from '@/types/album';

interface Album {
  release_name: string;
  release_artist: string;
  artists?: Array<{
    name: string;
    uri_artist: string;
    json_detailed_artist: string;
    images_uri_artist: { 'hi-res': string; medium: string };
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
  images_uri_release: { 'hi-res': string; medium: string };
  images_uri_artist: { 'hi-res': string; medium: string };
  format_primary?: string | null;
  labels?: string[];
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
      /** Last.fm's full biography; usually far longer than `biography`. */
      bio_content?: string;
      similar_artists?: Array<{ name: string; url?: string }>;
    };
    discogs?: { id?: string; url?: string };
  };
  local_images: { 'hi-res': string; medium: string };
}

function clipText(text: string | undefined | null, max: number): string {
  if (!text) return '';
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + '…';
}

function buildArtistMetaDescription(artistData: ArtistData, albumCount: number): string {
  const albumLine = `${albumCount} album${albumCount === 1 ? '' : 's'} in collection.`;
  const bio = artistData.biography;
  if (bio) {
    return clipText(`${artistData.name}. ${bio} ${albumLine}`, 300);
  }
  const genres = (artistData.genres || []).slice(0, 3).filter(Boolean).join(', ');
  const parts = [artistData.name];
  if (genres) parts.push(genres);
  parts.push(albumLine);
  return clipText(parts.join(' · '), 300);
}

function buildArtistJsonLd({
  artistData,
  canonicalUrl,
  ogImage,
  description,
}: {
  artistData: ArtistData;
  canonicalUrl: string;
  ogImage: string;
  description: string;
}): object[] {
  const sameAs = Array.from(new Set([
    artistData.wikipedia_url,
    artistData.spotify_url || artistData.services?.spotify?.external_urls?.spotify,
    artistData.discogs_url,
    artistData.services?.lastfm?.url,
    artistData.services?.apple_music?.url,
  ].filter(Boolean) as string[]));

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    '@id': canonicalUrl,
    url: canonicalUrl,
    name: artistData.name,
    description,
    image: ogImage,
  };
  const genres = (artistData.genres || []).filter(Boolean);
  if (genres.length) data.genre = Array.from(new Set(genres));
  if (sameAs.length) data.sameAs = sameAs;
  if (artistData.country) data.foundingLocation = artistData.country;
  if (artistData.formed_date) data.foundingDate = artistData.formed_date;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${appConfig.siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Artists', item: `${appConfig.siteUrl}/artists` },
      { '@type': 'ListItem', position: 3, name: artistData.name },
    ],
  };

  return [data, breadcrumb];
}

export function ArtistDetailPage() {
  const { artistPath } = useParams<{ artistPath: string }>();
  const { albums: rawCollection, loading } = useCollection();
  const collection = rawCollection as unknown as Album[];
  const { albums, artistJsonUrl } = useMemo(() => findArtistAlbums(collection, artistPath), [collection, artistPath]);
  const [detail, setDetail] = useState<{ url: string; data: ArtistData } | null>(null);
  const artistData = detail && detail.url === artistJsonUrl ? detail.data : null;

  // Newest additions first (also drives the flood below).
  const byAdded = useMemo(() => [...albums].sort((a, b) => b.date_added.localeCompare(a.date_added)), [albums]);
  const [order, setOrder] = useState<DiscographyOrder>('added');
  const discography = useMemo(
    () => (order === 'added' ? [{ label: '', albums: byAdded }] : groupByDecade(albums)),
    [order, byAdded, albums],
  );

  // The top of the page is one solid colour: the boldest sleeve among the
  // artist's last ten additions. Its dark swatch grounds the rest of the page.
  const colourMap = useAlbumColorMap();
  const flood = useMemo(
    () => recordsFlood(byAdded.map(a => a.uri_release), colourMap, 10) ?? bandFromFlood(floodFor(null)),
    [byAdded, colourMap],
  );
  usePageFlood(
    byAdded.length ? flood.top : null,
    byAdded.length ? flood.ink : null,
    byAdded.length ? { cover: getAlbumImageFromData(byAdded[0].uri_release, 'medium'), ground: flood.ground } : undefined,
  );
  // Blend the portrait into the flood. Multiply turns a light backdrop into
  // the flood colour; screen does the same for a dark backdrop, but only on a
  // dark flood; on a pale one it washes the subject out to a ghost, so there
  // the photo multiplies too and keeps its tonal range. Unmeasured → go by
  // the flood alone.
  const backdrop = useBackdropTone(artistPath ? getArtistAvatarFromData(`/artist/${artistPath}/`) : undefined);
  const darkFlood = flood.ink !== INK;
  const portraitBlend = darkFlood && backdrop !== 'light' ? 'screen' : 'multiply';

  useEffect(() => {
    if (!artistJsonUrl) return;
    let alive = true;
    loadDetailJson<ArtistData>(artistJsonUrl)
      .then(data => {
        if (alive) setDetail({ url: artistJsonUrl, data });
      })
      .catch(error => console.error('Error loading artist details:', error));
    return () => {
      alive = false;
    };
  }, [artistJsonUrl]);

  const pageTitle = artistData
    ? `${artistData.name} discography — ${albums.length} album${albums.length !== 1 ? 's' : ''} in collection | Russ.fm`
    : 'Loading Artist… | Russ.fm';
  usePageTitle(pageTitle);
  const artistCanonical = `${appConfig.siteUrl}/artist/${artistPath}`;
  const artistMetaDescription = artistData
    ? buildArtistMetaDescription(artistData, albums.length)
    : 'View artist details on Russ.fm';
  const artistJsonLd = artistData && artistPath
    ? buildArtistJsonLd({
        artistData,
        canonicalUrl: artistCanonical,
        ogImage: getArtistOGImageUrl(artistPath),
        description: artistMetaDescription,
      })
    : undefined;
  useMetaTags({
    title: pageTitle,
    description: artistMetaDescription,
    image: artistPath ? getArtistOGImageUrl(artistPath) : undefined,
    url: artistCanonical,
    type: 'music.musician',
    canonical: artistCanonical,
    jsonLd: artistJsonLd,
  });

  if (loading) {
    return <div className="h-[80vh] bg-[color:var(--ground)]" aria-busy="true" aria-label="Loading artist" />;
  }

  if (albums.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[1640px] flex-col items-start gap-6 px-5 py-24 md:px-10 lg:px-14">
        <p className="t-disp m-0 text-[48px] md:text-[72px]">Artist not found</p>
        <PillLink to="/artists/1">All artists</PillLink>
      </div>
    );
  }

  const artist = albums[0];
  const artistName = (() => {
    if (artistData?.name) return artistData.name;
    const decoded = decodeURIComponent(artistPath || '');
    const targetUri = `/artist/${decoded}/`;
    for (const album of albums) {
      const found = album.artists?.find(a => a.uri_artist === targetUri)
        ?? album.members?.find(m => m.uri_artist === targetUri);
      if (found) return found.name;
    }
    return artist.release_artist;
  })();

  const allGenres = [...new Set(albums.flatMap(a => a.genre_names))];
  const cleanGenres = getCleanGenresFromArray(allGenres, artistName);
  const bio = pickBiography(artistData);

  const artistUri = `/artist/${artistPath}/`;
  const wikipediaUrl =
    artistData?.wikipedia_url ||
    `https://en.wikipedia.org/wiki/${encodeURIComponent(artistName)}`;
  const lastfmSimilarNames = (artistData?.services?.lastfm?.similar_artists || []).map((s) => s.name.toLowerCase());

  const similarArtists = findSimilarArtists(collection, artistPath, artistName, lastfmSimilarNames);

  const boxsets = albums.filter(a => a.format_primary === 'Box Set').length;
  const listeners = artistData?.services?.lastfm?.listeners;
  const services = [
    artistData?.services?.spotify?.url && { label: 'Spotify', url: artistData.services.spotify.url },
    artistData?.services?.apple_music?.url && { label: 'Apple Music', url: artistData.services.apple_music.url },
    artistData?.services?.lastfm?.url && { label: 'Last.fm', url: artistData.services.lastfm.url },
    (artistData?.discogs_url || artistData?.services?.discogs?.url) && { label: 'Discogs', url: (artistData?.discogs_url || artistData?.services?.discogs?.url) as string },
    { label: 'Wikipedia', url: wikipediaUrl },
  ].filter(Boolean) as Array<{ label: string; url: string }>;

  const years = albums.map(originalYear).filter((y): y is number => y !== null);
  const firstYear = years.length ? Math.min(...years) : null;
  const latestYear = years.length ? Math.max(...years) : null;
  const stats: Array<[string, string]> = [
    ['Records', String(albums.length)],
    ...(boxsets ? [['Box sets', String(boxsets)] as [string, string]] : []),
    ...(firstYear && latestYear
      ? [[firstYear === latestYear ? 'Released' : 'Releases span', firstYear === latestYear ? String(firstYear) : `${firstYear}–${latestYear}`] as [string, string]]
      : []),
    ...(listeners != null ? [['Last.fm listeners', numberShort(Number(listeners))] as [string, string]] : []),
  ];

  return (
    <div>
      <div className="flood-surface" style={{ background: flood.background, color: flood.ink }}>
        <section className="mx-auto grid w-full max-w-[1640px] gap-8 px-5 pt-6 md:px-10 lg:grid-cols-[minmax(320px,520px)_minmax(0,1fr)] lg:gap-16 lg:px-14 lg:pt-10">
          {/* The portrait is printed into the flood in greyscale, blended so
              its backdrop takes the sleeve colours (see portraitBlend). The
              bottom fades out (see PORTRAIT_MASK); the mask sits on the
              <img> because a mask on the wrapper would isolate it and stop
              the blend reaching the flood. */}
          <div className="aspect-[4/5] w-full max-w-[520px] overflow-hidden">
            <img
              src={getArtistImageFromData(artistUri, 'hi-res')}
              alt={artistName}
              onError={handleImageError}
              className="h-full w-full object-cover object-top grayscale contrast-[1.2]"
              style={{ mixBlendMode: portraitBlend, ...PORTRAIT_MASK }}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-7 lg:pt-4">
            <FitTitle max={176} className="t-disp">{artistName}</FitTitle>
            <dl className="m-0 flex flex-wrap gap-x-10 gap-y-4">
              {stats.map(([k, v]) => (
                <div key={k} className="flex flex-col-reverse gap-1">
                  <dt className="t-kicker text-[11px]">{k}</dt>
                  <dd className="t-disp m-0 text-[36px] md:text-[56px]">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2.5">
              {services.map((s, i) => (
                <PillLink key={s.label} to={s.url} solid={i === 0 ? { background: flood.ink, color: flood.top } : undefined}>
                  {s.label}
                </PillLink>
              ))}
            </div>
            {cleanGenres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {cleanGenres.slice(0, 8).map(g => (
                  <Link key={g} to={`/genre/${slugify(g)}`} className="t-mono rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase opacity-80 hover:opacity-100" style={{ borderColor: 'currentColor' }}>
                    {g}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="h-16 lg:h-20" />
      </div>

      <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-24 px-5 pt-20 md:px-10 lg:px-14">
        {bio && (
          <section className="flex flex-col gap-8">
            <SectionHeading title="Biography" />
            <Bio text={bio} />
          </section>
        )}

        <section className="flex flex-col gap-10">
          <SectionHeading
            title="Discography"
            note={`${albums.length} ${albums.length === 1 ? 'record' : 'records'}${order === 'added' ? ' · newest additions first' : ' · by original release'}`}
          >
            {albums.length > 1 && (
              <div role="group" aria-label="Order" className="flex gap-1 rounded-full bg-[color:var(--ground-2)] p-1">
                {DISCOGRAPHY_ORDERS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={order === o.value}
                    onClick={() => setOrder(o.value)}
                    className={cn(
                      'h-10 rounded-full px-4 text-[14px] font-bold transition-colors',
                      order === o.value ? 'bg-[color:var(--cream)] text-[color:var(--ground)]' : 'hover:bg-[color:var(--ground-3)]',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </SectionHeading>
          <div className="flex flex-col">
            {discography.map(group => (
              <div
                key={group.label || 'all'}
                className={cn(
                  'grid gap-6 border-t py-10 first:border-t-0 first:pt-0',
                  group.label && 'lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10',
                )}
                style={{ borderColor: 'var(--cream-rule)' }}
              >
                {group.label && (
                  <div className="flex items-baseline gap-4 lg:sticky lg:top-28 lg:flex-col lg:gap-2 lg:self-start">
                    <h3 className="t-disp m-0 text-[36px] md:text-[48px]">{group.label}</h3>
                    <span className="t-mono text-[12px] text-[color:var(--cream-dim)]">
                      {group.albums.length} {group.albums.length === 1 ? 'record' : 'records'}
                    </span>
                  </div>
                )}
                <div className={cn('grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:gap-x-6', group.label ? 'xl:grid-cols-5' : 'lg:grid-cols-4 xl:grid-cols-6')}>
                  {group.albums.map(a => (
                    <RecordTile
                      key={a.uri_release}
                      album={a}
                      palette={colourMap?.[a.uri_release]}
                      showArtist={a.release_artist !== artistName}
                      meta={[
                        order === 'added' ? `Added ${formatAdded(a.date_added)}` : originalYear(a) ?? 'Undated',
                        a.format_primary === 'Box Set' ? 'Box set' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {similarArtists.length > 0 && (
          <section className="flex flex-col gap-8">
            <SectionHeading title="Similar artists" />
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {similarArtists.map(a => (
                <ArtistCard key={a.uri} artist={a} palette={a.latestUri ? colourMap?.[a.latestUri] : null} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Roughly how much biography shows before Read more. */
const BIO_PREVIEW = 1500;

function Bio({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const long = text.length > BIO_PREVIEW + 300;

  // Whole paragraphs up to the preview length; a single long opening
  // paragraph is cut at a word boundary instead.
  let shown = paragraphs;
  if (long && !open) {
    shown = [];
    let used = 0;
    for (const p of paragraphs) {
      if (used && used + p.length > BIO_PREVIEW) break;
      shown.push(used + p.length > BIO_PREVIEW * 1.2 ? `${p.slice(0, BIO_PREVIEW).replace(/\s+\S*$/, '')}…` : p);
      used += p.length;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="columns-1 gap-12 md:columns-2 xl:columns-3">
        {shown.map((p, i) => (
          <p key={i} className="m-0 mb-4 text-[17px] leading-[1.65] last:mb-0 md:text-[18px]">
            {p}
          </p>
        ))}
      </div>
      {long && (
        <button type="button" className="pill self-start" onClick={() => setOpen(v => !v)} aria-expanded={open}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

/** The longer of the stored biography and Last.fm's full one, cleaned. */
function pickBiography(data?: ArtistData | null): string | null {
  const short = cleanBiography(data?.biography);
  const full = cleanBiography(data?.services?.lastfm?.bio_content);
  if (!full) return short;
  if (!short) return full;
  return full.length > short.length ? full : short;
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

/**
 * Which records belong to an artist page (headline, joint or band-member
 * credits) and which artist JSON describes them.
 */
function findArtistAlbums(collection: Album[], artistPath: string | undefined): { albums: Album[]; artistJsonUrl: string | null } {
  if (!collection.length) return { albums: [], artistJsonUrl: null };
  const decodedArtistPath = decodeURIComponent(artistPath || '');
  const targetUri = `/artist/${decodedArtistPath}/`;

  const matchesTarget = (uri: string | null | undefined) => {
    if (!uri) return false;
    if (uri === targetUri) return true;
    const p = uri.replace('/artist/', '').replace('/', '');
    return decodedArtistPath === sanitizeFolderName(p);
  };
  // Band line-up credits (album.members) count too, so a player's page lists the band's albums.
  const findMember = (album: Album) => album.members?.find(m => matchesTarget(m.uri_artist));

  const albums = collection.filter(album => {
    if (matchesTarget(album.uri_artist)) return true;
    if (album.artists?.some(a => matchesTarget(a.uri_artist))) return true;
    if (findMember(album)) return true;
    if (decodedArtistPath === sanitizeFolderName(album.release_artist)) return true;
    return false;
  });
  if (!albums.length) return { albums, artistJsonUrl: null };

  let artistJsonUrl: string | null = null;
  for (const album of albums) {
    const found = album.artists?.find(a => matchesTarget(a.uri_artist)) ?? findMember(album);
    if (found?.json_detailed_artist) { artistJsonUrl = found.json_detailed_artist; break; }
  }
  if (!artistJsonUrl) {
    for (const album of albums) {
      const p = album.uri_artist.replace('/artist/', '').replace('/', '');
      if (decodedArtistPath === sanitizeFolderName(p)) { artistJsonUrl = album.json_detailed_artist; break; }
    }
  }
  return { albums, artistJsonUrl: artistJsonUrl ?? albums[0].json_detailed_artist };
}

/** Six artists who share genres with this one, Last.fm's similar artists first. */
function findSimilarArtists(collection: Album[], artistPath: string | undefined, artistName: string, lastfmSimilarNames: string[]) {
  if (!collection.length) return [];

  const explorer = getGenreExplorer(collection as unknown as CollectionAlbum[]);
  const selectedArtist =
    resolveArtist(explorer.allGenre, artistPath) ||
    explorer.allGenre.artists.find((candidate) => candidate.name.toLowerCase() === artistName.toLowerCase());

  if (!selectedArtist) return [];

  const candidates = getRelatedArtistsForArtist(selectedArtist, explorer.genres).map(({ artist }) => artist);
  const ranked = lastfmSimilarNames.length > 0
    ? [
        ...candidates.filter((c) => lastfmSimilarNames.includes(c.name.toLowerCase())),
        ...candidates.filter((c) => !lastfmSimilarNames.includes(c.name.toLowerCase())),
      ]
    : candidates;

  return ranked.slice(0, 6).map(artist => {
    const latest = collection
      .filter(a => a.uri_artist === artist.uri)
      .sort((a, b) => b.date_added.localeCompare(a.date_added))[0];
    return {
      name: artist.name,
      uri: artist.uri,
      image: getArtistImageFromData(artist.uri, 'medium'),
      albumCount: artist.totalAlbumCount || artist.albumCount,
      latestUri: latest?.uri_release,
    };
  });
}

function formatAdded(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The artist portrait fades out at the bottom only: a long fade whose stops
 * follow an ease-out curve, so there's no visible line where it starts. The
 * other edges stay crisp.
 */
const PORTRAIT_FADE = [
  '#000 40%',
  'rgba(0,0,0,.94) 52%',
  'rgba(0,0,0,.82) 62%',
  'rgba(0,0,0,.64) 71%',
  'rgba(0,0,0,.44) 79%',
  'rgba(0,0,0,.26) 86%',
  'rgba(0,0,0,.12) 92%',
  'rgba(0,0,0,.04) 97%',
  'transparent 100%',
].join(', ');
const PORTRAIT_MASK = {
  maskImage: `linear-gradient(to bottom, ${PORTRAIT_FADE})`,
  WebkitMaskImage: `linear-gradient(to bottom, ${PORTRAIT_FADE})`,
} as const;

type DiscographyOrder = 'added' | 'year';

const DISCOGRAPHY_ORDERS: Array<{ value: DiscographyOrder; label: string }> = [
  { value: 'added', label: 'Recently added' },
  { value: 'year', label: 'By year' },
];

/** Records grouped by decade of original release (Discogs master year), oldest first. */
function groupByDecade(albums: Album[]): Array<{ label: string; albums: Album[] }> {
  const sorted = [...albums].sort((a, b) => {
    const ya = originalYear(a);
    const yb = originalYear(b);
    if (ya !== yb) return ya === null ? 1 : yb === null ? -1 : ya - yb;
    return a.release_name.localeCompare(b.release_name);
  });
  const groups: Array<{ label: string; albums: Album[] }> = [];
  for (const album of sorted) {
    const y = originalYear(album);
    const label = y === null ? 'Undated' : `${Math.floor(y / 10) * 10}s`;
    const last = groups[groups.length - 1];
    if (last?.label === label) last.albums.push(album);
    else groups.push({ label, albums: [album] });
  }
  return groups;
}
