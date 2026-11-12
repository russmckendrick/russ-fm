import { useState, useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowUpRight, Tv, Waypoints } from 'lucide-react';
import { ArtistCard } from '@/components/ArtistCard';
import { PillLink, RecordTile, SectionHeading, bandFromFlood, newestFlood, usePageFlood } from '@/components/player';
import { ExpandableBody, LinerNotes } from '@/components/player/LinerNotes';
import { serviceIconFor } from '@/components/player/service-icon';
import { PosterWall } from '@/components/artist/PosterWall';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useGlassBand } from '@/hooks/useGlassBand';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { phoneCrop, useArtistImageInfo, type HeroPhoto } from '@/lib/artistImage';
import { artistWallFor } from '@/lib/artistWalls';
import { AlsoAppearsOn } from '@/components/various/AlsoAppearsOn';
import { VariousShelves } from '@/components/various/VariousShelves';
import { WhoTurnsUp } from '@/components/various/WhoTurnsUp';
import { useCompilations } from '@/components/various/useCompilations';
import { VARIOUS_NAME, VARIOUS_SLUG, shelfOf } from '@/lib/compilations';
import { getGenreExplorer, getRelatedArtistsForArtist, resolveArtist } from '@/lib/genreExplorer';
import { loadDetailJson, useCollection } from '@/lib/collection';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { artistMatcher } from '@/lib/artistMatch';
import { threadFromArtist } from '@/lib/explore/links';
import { artistChannel, loadTv } from '@/lib/tv';
import { slugify } from '@/lib/browseFacets';
import { floodFor } from '@/lib/sleeveColour';
import { originalYear } from '@/lib/releaseYear';
import { cn } from '@/lib/utils';
import { getAlbumImageFromData, getArtistFanartFromData, getArtistImageFromData, getArtistOGImageUrl, getArtistPhotoFromData } from '@/lib/image-utils';
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
  styles?: string[];
  uri_release: string;
  uri_artist: string;
  date_added: string;
  date_release_year: string;
  year_original?: number | null;
  vinyl_colours?: string[];
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
  // /artist/various is the Various Artists page: every compilation, on shelves,
  // and who plays on them, in place of a discography and similar artists.
  const various = artistPath === VARIOUS_SLUG;
  // Who plays on the compilations: the Various page's cast, everyone else's "Also appears on".
  const compilations = useCompilations();

  // Newest additions first (also drives the flood below).
  const byAdded = useMemo(() => [...albums].sort((a, b) => b.date_added.localeCompare(a.date_added)), [albums]);
  const [order, setOrder] = useState<DiscographyOrder>('added');
  const discography = useMemo(
    () => (order === 'added' ? [{ label: '', albums: byAdded }] : groupByDecade(albums)),
    [order, byAdded, albums],
  );

  // The page takes the newest addition's sleeve colour, skipping monochrome
  // ones: the band under the hero, the wall's tint and the name's overprint.
  // Its dark swatch grounds the rest of the page.
  const colourMap = useAlbumColorMap();
  const flood = useMemo(
    () => newestFlood(byAdded.map(a => a.uri_release), colourMap) ?? bandFromFlood(floodFor(null)),
    [byAdded, colourMap],
  );
  // The hero is the artist's fly-poster on a wall (PosterWall): the room most
  // of their records play in, as the album page's listening room. The header
  // is see-through over it.
  const wall = useMemo(() => artistWallFor(byAdded), [byAdded]);
  usePageFlood(
    byAdded.length ? flood.top : null,
    byAdded.length ? flood.ink : null,
    byAdded.length ? { cover: getAlbumImageFromData(byAdded[0].uri_release, 'medium'), ground: flood.ground, vinyl: byAdded[0].vinyl_colours?.[0], room: true } : undefined,
  );
  // The poster's photo: their TheAudioDB fanart, else their own photo (the
  // image chosen in the scrapper when there is one), cropped round its faces.
  const imageInfo = useArtistImageInfo(artistPath ? `/artist/${artistPath}/` : undefined);
  const [failedFanart, setFailedFanart] = useState<string | null>(null);

  useEffect(() => {
    if (!artistJsonUrl) return;
    let alive = true;
    loadDetailJson<ArtistData>(artistJsonUrl)
      .then(data => {
        // Discogs calls the placeholder plain "Various".
        if (alive) setDetail({ url: artistJsonUrl, data: various ? { ...data, name: VARIOUS_NAME } : data });
      })
      .catch(error => console.error('Error loading artist details:', error));
    return () => {
      alive = false;
    };
  }, [artistJsonUrl, various]);

  // How many videos their own TV channel has (/tv/artist/:slug); the link
  // only shows when there are some. tv.json is shared with the TV and album pages.
  const [tvVideos, setTvVideos] = useState(0);
  useEffect(() => {
    if (!artistPath || !rawCollection.length) return;
    let alive = true;
    loadTv()
      .then(tv => {
        if (alive) setTvVideos(artistChannel(tv, rawCollection, artistPath)?.items.length ?? 0);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [artistPath, rawCollection]);

  const pageTitle = artistData && various
    ? `${VARIOUS_NAME} — ${albums.length} compilations in collection | Russ.fm`
    : artistData
    ? `${artistData.name} discography — ${albums.length} album${albums.length !== 1 ? 's' : ''} in collection | Russ.fm`
    : 'Loading Artist… | Russ.fm';
  usePageTitle(pageTitle);
  const [bandRef, bandInset] = useGlassBand<HTMLElement>();
  const artistCanonical = `${appConfig.siteUrl}/artist/${artistPath}`;
  const artistMetaDescription = artistData
    ? buildArtistMetaDescription(artistData, albums.length)
    : 'View artist details on Russ.fm';
  const artistJsonLd = artistData && artistPath && !various
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
    if (various) return VARIOUS_NAME;
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
  const fanart = imageInfo?.fanart;
  const fanartSrc = fanart ? getArtistFanartFromData(artistUri, fanart.file) : null;
  const onFanart = !!fanartSrc && fanartSrc !== failedFanart;
  const posterSrc = onFanart && fanartSrc ? fanartSrc : getArtistPhotoFromData(artistUri, imageInfo?.source);
  const posterPhoto: HeroPhoto | null = onFanart && fanart
    ? fanart
    : imageInfo
      ? { width: imageInfo.width, height: imageInfo.height, faces: imageInfo.faces, people: imageInfo.people, salient: null, columns: [] }
      : null;
  const posterPosition = posterPhoto ? phoneCrop(posterPhoto, (wall.poster.width * wall.aspect) / wall.poster.height).position : undefined;
  // The Thread only knows artists credited on a record, not players known only from a band's line-up.
  const { matches: isThisArtist } = artistMatcher(artistPath || '');
  const threadUri = artistPath === 'various' ? null : (albums.flatMap(a => a.artists ?? []).find(a => isThisArtist(a.uri_artist))?.uri_artist ?? null);
  const wikipediaUrl = various
    ? null
    : artistData?.wikipedia_url || `https://en.wikipedia.org/wiki/${encodeURIComponent(artistName)}`;
  const lastfmSimilarNames = (artistData?.services?.lastfm?.similar_artists || []).map((s) => s.name.toLowerCase());

  const similarArtists = various ? [] : findSimilarArtists(collection, artistPath, artistName, lastfmSimilarNames);

  const boxsets = various ? 0 : albums.filter(a => a.format_primary === 'Box Set').length;
  const soundtracks = various ? albums.filter(a => shelfOf(a) === 'soundtrack').length : 0;
  const services = [
    artistData?.services?.spotify?.url && { label: 'Spotify', url: artistData.services.spotify.url },
    artistData?.services?.apple_music?.url && { label: 'Apple Music', url: artistData.services.apple_music.url },
    artistData?.services?.lastfm?.url && { label: 'Last.fm', url: artistData.services.lastfm.url },
    (artistData?.discogs_url || artistData?.services?.discogs?.url) && { label: 'Discogs', url: (artistData?.discogs_url || artistData?.services?.discogs?.url) as string },
    wikipediaUrl && { label: 'Wikipedia', url: wikipediaUrl },
  ].filter(Boolean) as Array<{ label: string; url: string }>;

  const years = albums.map(originalYear).filter((y): y is number => y !== null);
  const firstYear = years.length ? Math.min(...years) : null;
  const latestYear = years.length ? Math.max(...years) : null;
  // The band under the poster: facts and links only (the poster carries the name).
  const facts: Array<[string, ReactNode]> = [
    ...(artistData?.country && !various ? [['From', artistData.country] as [string, ReactNode]] : []),
    ...(artistData?.formed_date && !various ? [['Formed', String(artistData.formed_date).slice(0, 4)] as [string, ReactNode]] : []),
    ['Records', String(albums.length)],
    ...(soundtracks ? [['Soundtracks', String(soundtracks)] as [string, string]] : []),
    ...(boxsets ? [['Box sets', String(boxsets)] as [string, string]] : []),
    ...(firstYear && latestYear
      ? [['Released', firstYear === latestYear ? String(firstYear) : `${firstYear}–${latestYear}`] as [string, string]]
      : []),
    ...(!various && cleanGenres.length
      ? [[
          'Genres',
          cleanGenres.slice(0, 3).map((g, i) => (
            <span key={g}>
              {i > 0 && ', '}
              <Link to={`/genre/${slugify(g)}`} className="hover:underline">{g}</Link>
            </span>
          )),
        ] as [string, ReactNode]]
      : []),
  ];

  return (
    <div>
      {/* Pulled up under the sticky header (64px, 84px from md), which is see-through here. */}
      <div className="artist-wall relative -mt-16 h-[clamp(420px,125vw,940px)] md:-mt-[84px] md:h-[clamp(460px,78svh,940px)] lg:h-[clamp(560px,94svh,1100px)]">
        {imageInfo !== undefined && (
          <PosterWall
            wall={wall}
            photo={posterSrc}
            photoPosition={posterPosition}
            onPhotoError={onFanart && fanartSrc ? () => setFailedFanart(fanartSrc) : undefined}
            name={artistName}
            sleeves={uniqueTitles(byAdded).slice(0, 4).map(a => ({
              key: a.uri_release,
              src: getAlbumImageFromData(a.uri_release, 'medium'),
              title: a.release_name,
              href: a.uri_release,
            }))}
            tint={flood.top}
            bottomInset={bandInset}
            className="h-full"
          />
        )}
      {/* The facts sit on the wall itself, on glass: no band of their own. */}
      <section ref={bandRef} className="glass-band" style={{ '--band-tint': flood.top } as CSSProperties}>
        <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-4 px-5 pb-6 md:min-h-[72px] md:flex-row md:items-center md:gap-10 md:px-10 md:pb-6 lg:px-14 lg:pb-8">
          <dl className="m-0 grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:flex md:gap-9 md:overflow-hidden">
            {facts.map(([k, v]) => (
              <div key={k} className={cn('min-w-0', k === 'Genres' && 'col-span-2 sm:col-span-1')}>
                <dt className="glass-sub t-kicker text-[10px]">{k}</dt>
                <dd className="m-0 mt-1.5 truncate text-[16px] font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            {tvVideos > 0 && (
              <Link
                to={`/tv/artist/${artistPath}`}
                className="icon-btn h-11 w-11 border-2 border-current"
                aria-label={`Watch ${tvVideos} video${tvVideos === 1 ? '' : 's'} on russ.fm/tv`}
                title={`Watch ${tvVideos} video${tvVideos === 1 ? '' : 's'} on russ.fm/tv`}
              >
                <Tv className="h-5 w-5" aria-hidden />
              </Link>
            )}
            {services.map(s => {
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
            {threadUri && (
              <Link
                to={threadFromArtist(threadUri)}
                className="icon-btn h-11 w-11 border-2 border-current"
                aria-label="Follow the thread"
                title={`Follow the links from ${artistName} in The Thread`}
              >
                <Waypoints className="h-5 w-5" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </section>
      </div>

      <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-24 px-5 pt-12 md:px-10 lg:px-14 lg:pt-14">
        {bio && (
          <section className="flex flex-col gap-8">
            {/* The lede opens the section; the heading is kept for screen readers and the outline only. */}
            <h2 className="sr-only">Biography</h2>
            <ExpandableBody fade={flood.ground} collapsedMaxHeight={520} spare={300}>
              <LinerNotes text={bio} wide />
            </ExpandableBody>
          </section>
        )}

        {various ? (
          <VariousShelves albums={byAdded} compilations={compilations} colourMap={colourMap} />
        ) : (
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
        )}

        {various ? (
          compilations && <WhoTurnsUp data={compilations} />
        ) : (
          <AlsoAppearsOn
            artistUri={artistUri}
            compilations={compilations}
            collection={rawCollection}
            own={new Set(albums.map(a => a.uri_release))}
            colourMap={colourMap}
          />
        )}

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

/**
 * Which records belong to an artist page (headline, joint or band-member
 * credits) and which artist JSON describes them.
 */
function findArtistAlbums(collection: Album[], artistPath: string | undefined): { albums: Album[]; artistJsonUrl: string | null } {
  if (!collection.length) return { albums: [], artistJsonUrl: null };
  const decodedArtistPath = decodeURIComponent(artistPath || '');
  // Band line-up credits (album.members) count too, so a player's page lists the band's albums.
  const { matches: matchesTarget, credits } = artistMatcher(artistPath || '');
  const findMember = (album: Album) => album.members?.find(m => matchesTarget(m.uri_artist));

  const albums = collection.filter(credits);
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

/** One record per title, newest first: two pressings of a record show once on the poster. */
function uniqueTitles<T extends { release_name: string }>(albums: T[]): T[] {
  const seen = new Set<string>();
  return albums.filter(a => {
    const key = a.release_name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
