import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlbumCard } from '@/components/AlbumCard';
import { BrowseHeader } from '@/components/browse/BrowseHeader';
import { EditorialEmpty, EditorialSkeleton, PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { appConfig } from '@/config/app.config';
import { albumsForFacetSlug, FACETS, type FacetKey } from '@/lib/browseFacets';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import type { Album } from '@/types/album';

interface FacetDetailPageProps {
  facetKey: FacetKey;
}

interface FacetStats {
  albumCount: number;
  artistCount: number;
  decadeRange: { first: number; last: number } | null;
  topArtists: Array<{ name: string; uri: string; count: number }>;
}

function buildFacetStats(albums: Album[]): FacetStats {
  const artists = new Map<string, { name: string; uri: string; count: number }>();
  let firstYear = Number.POSITIVE_INFINITY;
  let lastYear = 0;

  for (const album of albums) {
    const albumArtists = album.artists?.length ? album.artists : [{ name: album.release_artist, uri_artist: album.uri_artist }];
    for (const artist of albumArtists) {
      const name = artist.name;
      if (!name || name.toLowerCase() === 'various') continue;
      const uri = artist.uri_artist || `/artist/${name.toLowerCase().replace(/\s+/g, '-')}/`;
      const current = artists.get(uri);
      if (current) {
        current.count++;
      } else {
        artists.set(uri, { name, uri, count: 1 });
      }
    }
    const y = new Date(album.date_release_year).getFullYear();
    if (Number.isFinite(y) && y >= 1900) {
      if (y < firstYear) firstYear = y;
      if (y > lastYear) lastYear = y;
    }
  }

  const topArtists = Array.from(artists.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);

  return {
    albumCount: albums.length,
    artistCount: artists.size,
    decadeRange: lastYear > 0 ? { first: firstYear, last: lastYear } : null,
    topArtists,
  };
}

function buildFacetIntro(facetKey: FacetKey, displayName: string, stats: FacetStats): string {
  const { albumCount, artistCount, decadeRange } = stats;
  const albumWord = albumCount === 1 ? 'album' : 'albums';
  const artistWord = artistCount === 1 ? 'artist' : 'artists';
  const range = decadeRange
    ? decadeRange.first === decadeRange.last
      ? `from ${decadeRange.first}`
      : `spanning ${decadeRange.first}–${decadeRange.last}`
    : '';
  switch (facetKey) {
    case 'genre':
      return `${albumCount} ${displayName} ${albumWord} from ${artistCount} ${artistWord} in the russ.fm collection${range ? `, ${range}` : ''}.`;
    case 'label':
      return `${albumCount} ${albumWord} from ${displayName} in the collection, by ${artistCount} different ${artistWord}${range ? ` ${range}` : ''}.`;
    case 'decade':
      return `${albumCount} ${albumWord} released in ${displayName}, by ${artistCount} ${artistWord} in the russ.fm collection.`;
    case 'country':
      return `${albumCount} ${albumWord} pressed in ${displayName}, by ${artistCount} ${artistWord} in the collection${range ? `, ${range}` : ''}.`;
  }
}

function buildFacetMeta(
  facetKey: FacetKey,
  facetSingular: string,
  displayName: string,
  slug: string,
  intro: string,
) {
  const canonical = `${appConfig.siteUrl}/${facetSingular}/${slug}`;
  const titleByFacet: Record<FacetKey, string> = {
    genre: `${displayName} albums in the collection | Russ.fm`,
    label: `${displayName} releases | Russ.fm`,
    decade: `${displayName} albums | Russ.fm`,
    country: `Albums from ${displayName} | Russ.fm`,
  };
  const title = titleByFacet[facetKey];

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${appConfig.siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Browse', item: `${appConfig.siteUrl}/browse` },
      { '@type': 'ListItem', position: 3, name: displayName },
    ],
  };

  const collectionPage: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': canonical,
    url: canonical,
    name: title,
    description: intro,
  };

  return { title, canonical, intro, jsonLd: [collectionPage, breadcrumb] };
}

export function FacetDetailPage({ facetKey }: FacetDetailPageProps) {
  const facet = FACETS[facetKey];
  const { slug } = useParams<{ slug: string }>();
  const [collection, setCollection] = useState<Album[] | null>(null);
  const [page, setPage] = useState(1);
  const itemsPerPage = appConfig.pagination.itemsPerPage.albums;

  useEffect(() => {
    fetch('/collection.json')
      .then((r) => r.json())
      .then((data: Album[]) => setCollection(excludeBoxsetMembers(data)))
      .catch(() => setCollection([]));
  }, []);

  const { match, albums } = useMemo(() => {
    if (!collection || !slug) return { match: null, albums: [] };
    const result = albumsForFacetSlug(facet, collection, slug);
    const sorted = [...result.albums].sort(
      (a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime(),
    );
    return { match: result.match, albums: sorted };
  }, [collection, slug, facet]);

  const displayName = match
    ? facet.displayName
      ? facet.displayName(match.name)
      : match.name
    : slug ?? '';

  const stats = useMemo(() => buildFacetStats(albums), [albums]);
  const intro = match ? buildFacetIntro(facetKey, displayName, stats) : '';
  const meta = match && slug
    ? buildFacetMeta(facetKey, facet.singular, displayName, slug, intro)
    : null;

  usePageTitle(meta ? meta.title : `${facet.listTitle} | Russ.fm`);
  useMetaTags({
    title: meta ? meta.title : `${facet.listTitle} | Russ.fm`,
    description: meta ? meta.intro : `Browse ${facet.plural} in the russ.fm collection.`,
    image: `${appConfig.siteUrl}/og-image.png`,
    url: meta ? meta.canonical : `${appConfig.siteUrl}/${facet.singular}/${slug ?? ''}`,
    type: 'website',
    canonical: meta ? meta.canonical : undefined,
    jsonLd: meta ? meta.jsonLd : undefined,
  });

  const totalPages = Math.max(1, Math.ceil(albums.length / itemsPerPage));
  const startIndex = (page - 1) * itemsPerPage;
  const paginated = albums.slice(startIndex, startIndex + itemsPerPage);

  if (!collection) {
    return (
      <PageContainer>
        <EditorialSkeleton label="Loading collection…" />
      </PageContainer>
    );
  }

  if (!match) {
    return (
      <PageContainer>
        <EditorialEmpty
          title={`Nothing matches "${slug}"`}
          detail={`No ${facet.singular} in the collection with that slug.`}
          action={`All ${facet.plural}`}
          actionTo={`/${facet.plural}`}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <BrowseHeader
        num="00"
        kicker={facet.detailKicker}
        title={displayName}
        counts={[
          { label: 'Albums', value: albums.length.toLocaleString() },
          { label: 'Artists', value: stats.artistCount.toLocaleString() },
          { label: 'Page', value: `${page}/${totalPages}` },
        ]}
      />

      <p className="mb-6 max-w-3xl font-grot text-[15px] leading-[1.6] text-ink-2">
        {intro}
      </p>

      {stats.topArtists.length > 1 && (
        <p className="mb-8 max-w-3xl font-mono text-[12px] uppercase tracking-[0.08em] text-ink-dim">
          Most collected:{' '}
          {stats.topArtists.slice(0, 5).map((a, i) => (
            <span key={a.uri}>
              {i > 0 ? ' · ' : ''}
              <Link to={a.uri} className="text-ink hover:text-hl">
                {a.name}
              </Link>
              <span className="text-ink-dim"> ({a.count})</span>
            </span>
          ))}
        </p>
      )}

      <div className="mb-6 flex items-baseline justify-between">
        <Link
          to={`/${facet.plural}`}
          className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim transition-colors hover:text-hl"
        >
          ← All {facet.plural}
        </Link>
      </div>

      {albums.length === 0 ? (
        <EditorialEmpty title="No albums" detail={`Nothing in the collection for ${displayName}.`} />
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {paginated.map((album, i) => (
            <AlbumCard key={album.uri_release} album={album} index={startIndex + i + 1} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-12 border-t border-rule pt-6">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                .map((n, idx, arr) => {
                  const prev = arr[idx - 1];
                  return (
                    <PaginationItem key={n}>
                      {prev !== undefined && n - prev > 1 ? (
                        <span className="px-3 font-mono text-[11px] text-ink-dim">…</span>
                      ) : null}
                      <PaginationLink
                        onClick={() => setPage(n)}
                        isActive={page === n}
                        className="cursor-pointer"
                      >
                        {n}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

    </PageContainer>
  );
}
