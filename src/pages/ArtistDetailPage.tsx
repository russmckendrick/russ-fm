import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SkipBack, SkipForward } from 'lucide-react';
import { ArtistCard } from '@/components/ArtistCard';
import { Crate, type CrateRecord } from '@/components/artist/Crate';
import { PillLink, SectionHeading, usePageFlood } from '@/components/player';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { buildGenreExplorer, getRelatedArtistsForArtist, resolveArtist } from '@/lib/genreExplorer';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';
import { slugify } from '@/lib/browseFacets';
import { floodFor, inkOn, vividFrom } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import { getAlbumImageFromData, getArtistImageFromData, getArtistOGImageUrl, handleImageError, sanitizeJsonPath } from '@/lib/image-utils';
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
  const [collection, setCollection] = useState<Album[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artistData, setArtistData] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(true);

  // The crate: every record by release year. The front record's sleeve
  // colour floods the top of the page (and the nav).
  const colourMap = useAlbumColorMap();
  const [crateIndex, setCrateIndex] = useState<number | null>(null);
  const crateRecords = useMemo<CrateRecord[]>(() => {
    const withYear = albums.map(a => {
      const y = new Date(a.date_release_year).getFullYear();
      return { uri_release: a.uri_release, release_name: a.release_name.trim(), year: Number.isFinite(y) && y > 1900 ? String(y) : '—' };
    });
    return withYear.sort((a, b) => (a.year === '—' ? 1 : b.year === '—' ? -1 : a.year.localeCompare(b.year)) || a.release_name.localeCompare(b.release_name));
  }, [albums]);
  // Start at the front of the crate (earliest release) so the rest stand behind it.
  const crateIdx = Math.min(crateIndex ?? 0, Math.max(0, crateRecords.length - 1));
  const flood = floodFor(colourMap?.[crateRecords[crateIdx]?.uri_release]);
  usePageFlood(crateRecords.length ? flood.flood : null, crateRecords.length ? flood.ink : null);
  useEffect(() => setCrateIndex(null), [artistPath]);

  const discography = useMemo(() => {
    const out: Array<{ kind: 'decade'; label: string; count: number } | { kind: 'album'; album: Album; year: string; flood: string }> = [];
    const byUri = new Map(albums.map(a => [a.uri_release, a]));
    const decadeOf = (y: string) => (y === '—' ? 'Undated' : `${y.slice(0, 3)}0s`);
    let last = '';
    crateRecords.forEach(r => {
      const d = decadeOf(r.year);
      if (d !== last) {
        out.push({ kind: 'decade', label: d, count: crateRecords.filter(x => decadeOf(x.year) === d).length });
        last = d;
      }
      const album = byUri.get(r.uri_release);
      if (album) out.push({ kind: 'album', album, year: r.year, flood: floodFor(colourMap?.[r.uri_release]).flood });
    });
    return out;
  }, [albums, crateRecords, colourMap]);

  const loadArtistData = useCallback(async () => {
    try {
      const collectionResponse = await fetch('/collection.json');
      const collection = await collectionResponse.json() as Album[];
      setCollection(collection);

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

      const artistAlbums = collection.filter((album: Album) => {
        if (matchesTarget(album.uri_artist)) return true;
        if (album.artists?.some(a => matchesTarget(a.uri_artist))) return true;
        if (findMember(album)) return true;
        if (decodedArtistPath === sanitizeFolderName(album.release_artist)) return true;
        return false;
      });

      setAlbums(artistAlbums);

      if (artistAlbums.length > 0) {
        try {
          let artistJsonUrl: string | null = null;
          for (const album of artistAlbums) {
            const found = album.artists?.find(a => matchesTarget(a.uri_artist)) ?? findMember(album);
            if (found?.json_detailed_artist) { artistJsonUrl = found.json_detailed_artist; break; }
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
  const sortedAlbums = [...albums].sort(
    (a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime()
  );
  const years = sortedAlbums
    .map(a => new Date(a.date_release_year).getFullYear())
    .filter(y => Number.isFinite(y));
  const firstYear = years.length ? Math.min(...years) : null;
  const latestYear = years.length ? Math.max(...years) : null;
  const bio = cleanBiography(artistData?.biography);

  const artistUri = `/artist/${artistPath}/`;
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

    const candidates = getRelatedArtistsForArtist(selectedArtist, explorer.genres).map(({ artist }) => {
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

    if (lastfmSimilarNames.length > 0) {
      const lastfmRanked = candidates.filter((c) => lastfmSimilarNames.includes(c.name.toLowerCase()));
      const remaining = candidates.filter((c) => !lastfmSimilarNames.includes(c.name.toLowerCase()));
      return [...lastfmRanked, ...remaining].slice(0, 6);
    }

    return candidates.slice(0, 6);
  })();

  const current = crateRecords[crateIdx];
  const boxsets = albums.filter(a => a.format_primary === 'Box Set').length;
  const listeners = artistData?.services?.lastfm?.listeners;
  const nameSize = artistName.length <= 12 ? 'text-[64px] md:text-[120px] xl:text-[176px]' : artistName.length <= 22 ? 'text-[48px] md:text-[88px] xl:text-[128px]' : 'text-[40px] md:text-[64px] xl:text-[88px]';
  const services = [
    artistData?.services?.spotify?.url && { label: 'Spotify', url: artistData.services.spotify.url },
    artistData?.services?.apple_music?.url && { label: 'Apple Music', url: artistData.services.apple_music.url },
    artistData?.services?.lastfm?.url && { label: 'Last.fm', url: artistData.services.lastfm.url },
    (artistData?.discogs_url || artistData?.services?.discogs?.url) && { label: 'Discogs', url: (artistData?.discogs_url || artistData?.services?.discogs?.url) as string },
    { label: 'Wikipedia', url: wikipediaUrl },
  ].filter(Boolean) as Array<{ label: string; url: string }>;
  const filedAs = artistName.replace(/^the\s+/i, '').toUpperCase();
  const currentLongest = current ? Math.max(...current.release_name.split(/\s+/).map(w => w.length), 6) : 6;
  const currentAlbum = current ? albums.find(a => a.uri_release === current.uri_release) : undefined;

  const stats: Array<[string, string]> = [
    ['Records', String(albums.length)],
    ...(boxsets ? [['Box sets', String(boxsets)] as [string, string]] : []),
    ...(firstYear && latestYear ? [[firstYear === latestYear ? 'Released' : 'Releases span', firstYear === latestYear ? String(firstYear) : `${firstYear}–${latestYear}`] as [string, string]] : []),
    ...(listeners != null ? [['Last.fm listeners', numberShort(Number(listeners))] as [string, string]] : []),
  ];

  return (
    <div>
      <div className="flood-surface" style={{ background: flood.flood, color: flood.ink }}>
        <section className="mx-auto grid w-full max-w-[1640px] gap-8 px-5 pt-6 md:px-10 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] lg:gap-16 lg:px-14 lg:pt-10">
          <div className="aspect-[4/5] w-full max-w-[420px] overflow-hidden bg-black/10">
            <img
              src={getArtistImageFromData(artistUri, 'hi-res')}
              alt={artistName}
              onError={handleImageError}
              className="h-full w-full object-cover grayscale contrast-[1.1]"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-7 lg:pt-4">
            <h1 className={cn('t-disp m-0 break-words', nameSize)}>{artistName}</h1>
            <dl className="m-0 flex flex-wrap gap-x-10 gap-y-4">
              {stats.map(([k, v]) => (
                <div key={k} className="flex flex-col-reverse gap-1">
                  <dt className="t-kicker text-[11px]">{k}</dt>
                  <dd className="t-disp m-0 text-[36px] md:text-[56px]">{v}</dd>
                </div>
              ))}
            </dl>
            {bio && <Bio text={bio} />}
            <div className="flex flex-wrap gap-2.5">
              {services.map((s, i) => (
                <PillLink key={s.label} to={s.url} size="sm" solid={i === 0 ? { background: flood.ink, color: flood.flood } : undefined}>
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

        {current && (
          <section className="mx-auto grid w-full max-w-[1640px] items-center gap-10 px-5 pt-16 md:px-10 lg:grid-cols-[minmax(0,720px)_minmax(0,1fr)] lg:gap-12 lg:px-14">
            <Crate records={crateRecords} index={crateIdx} onChange={setCrateIndex} label={filedAs} tab={filedAs.split(/[\s,]+/)[0]} />
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex items-baseline gap-2.5">
                <span className="t-cond text-[64px] md:text-[72px]">{String(crateIdx + 1).padStart(2, '0')}</span>
                <span className="t-mono text-[14px] font-bold">/ {crateRecords.length}</span>
              </div>
              <h2 className="t-cond m-0" style={{ fontSize: `clamp(40px, 6vw, ${Math.min(96, Math.floor(520 / (currentLongest * 0.52)))}px)` }}>
                {current.release_name}
              </h2>
              <div className="flex flex-wrap gap-2">
                {[current.year, currentAlbum?.format_primary, currentAlbum?.labels?.[0]].filter(Boolean).map(v => (
                  <span key={v} className="inline-flex h-8 items-center rounded-full border-2 border-current px-3 text-[13px] font-bold">
                    {v}
                  </span>
                ))}
              </div>
              {currentAlbum?.date_added && (
                <span className="t-kicker" style={{ color: flood.sub }}>
                  Added {new Date(currentAlbum.date_added).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
              <div className="mt-1 flex items-center gap-3">
                <PillLink to={current.uri_release} solid={{ background: flood.ink, color: flood.flood }}>
                  View album
                </PillLink>
                <span className="flex-1" />
                <button type="button" className="icon-btn border-2 border-current" onClick={() => setCrateIndex(Math.max(0, crateIdx - 1))} disabled={crateIdx === 0} aria-label="Previous record">
                  <SkipBack className="h-5 w-5" fill="currentColor" />
                </button>
                <button type="button" className="icon-btn border-2 border-current" onClick={() => setCrateIndex(Math.min(crateRecords.length - 1, crateIdx + 1))} disabled={crateIdx === crateRecords.length - 1} aria-label="Next record">
                  <SkipForward className="h-5 w-5" fill="currentColor" />
                </button>
              </div>
              <span className="t-mono text-[12px] opacity-70">Scroll over the crate, use the arrow keys or click a record to flip</span>
            </div>
          </section>
        )}

        {crateRecords.length >= 4 ? (
          <section className="mx-auto w-full max-w-[1640px] px-5 pb-20 pt-12 md:px-10 lg:px-14">
            <div role="group" aria-label="Jump to a record by year" className="flex h-[110px] items-end">
              {crateRecords.map((r, k) => {
                const on = k === crateIdx;
                const colour = vividFrom(colourMap?.[r.uri_release]) ?? colourMap?.[r.uri_release]?.accent ?? '#3a3530';
                const decade = r.year !== '—' ? `${r.year.slice(0, 3)}0s` : '';
                const prevDecade = k > 0 && crateRecords[k - 1].year !== '—' ? `${crateRecords[k - 1].year.slice(0, 3)}0s` : '';
                return (
                  <button
                    key={r.uri_release}
                    type="button"
                    onClick={() => setCrateIndex(k)}
                    aria-label={`${r.release_name} (${r.year})`}
                    aria-current={on}
                    className="relative min-w-0 flex-1 transition-[height,transform] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1.5"
                    style={{ background: colour, height: on ? 80 : 44, boxShadow: on ? `0 0 0 3px ${flood.ink}` : 'inset 1px 0 0 rgba(0,0,0,.18)' }}
                  >
                    {on && <span className="t-mono absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap text-[13px] font-bold">{r.year}</span>}
                    {decade && decade !== prevDecade && <span className="t-mono absolute left-0 top-full mt-2.5 whitespace-nowrap text-[11px] font-bold md:text-[12px]">{decade}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="h-20" />
        )}
      </div>

      <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-24 px-5 pt-20 md:px-10 lg:px-14">
        <section className="flex flex-col gap-8">
          <SectionHeading title="Discography" note={`${albums.length} ${albums.length === 1 ? 'record' : 'records'} by release year`} />
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10">
            {discography.map(item =>
              item.kind === 'decade' ? (
                <div key={`d-${item.label}`} className="flex aspect-square flex-col justify-between bg-[color:var(--ground-2)] p-3 md:p-3.5">
                  <span className="t-disp text-[22px] md:text-[28px]">{item.label}</span>
                  <span className="t-mono text-[11px] text-[color:var(--cream-dim)]">
                    {item.count} {item.count === 1 ? 'record' : 'records'}
                  </span>
                </div>
              ) : (
                <Link key={item.album.uri_release} to={item.album.uri_release} className="tile aspect-square" aria-label={`${item.album.release_name} (${item.year})`}>
                  <img src={getAlbumImageFromData(item.album.uri_release, 'medium')} alt="" loading="lazy" />
                  <span className="tile-cap flex flex-col gap-0.5" style={{ background: item.flood, color: inkOn(item.flood) }} aria-hidden>
                    <span className="truncate text-[13px] font-bold">{item.album.release_name}</span>
                    <span className="t-mono truncate text-[11px] opacity-80">
                      {item.year}
                      {item.album.format_primary ? ` · ${item.album.format_primary}` : ''}
                    </span>
                  </span>
                </Link>
              ),
            )}
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

function Bio({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const paragraphs = text.split('\n').filter(p => p.trim());
  const long = text.length > 520;
  const shown = open || !long ? paragraphs : [paragraphs[0].length > 520 ? `${paragraphs[0].slice(0, 520).replace(/\s+\S*$/, '')}…` : paragraphs[0]];
  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      {shown.map((p, i) => (
        <p key={i} className="m-0 text-[17px] leading-[1.6] md:text-[18px]">
          {p}
        </p>
      ))}
      {long && (
        <button type="button" className="pill pill-sm self-start" onClick={() => setOpen(v => !v)} aria-expanded={open}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
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
