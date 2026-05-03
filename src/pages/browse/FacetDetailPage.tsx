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
import type { Album } from '@/types/album';

interface FacetDetailPageProps {
  facetKey: FacetKey;
}

/**
 * Albums filtered to a single facet value (one label, decade, or country).
 * Sort order is most-recently-added first; pagination mirrors AlbumsPage.
 */
export function FacetDetailPage({ facetKey }: FacetDetailPageProps) {
  const facet = FACETS[facetKey];
  const { slug } = useParams<{ slug: string }>();
  const [collection, setCollection] = useState<Album[] | null>(null);
  const [page, setPage] = useState(1);
  const itemsPerPage = appConfig.pagination.itemsPerPage.albums;

  useEffect(() => {
    fetch('/collection.json')
      .then((r) => r.json())
      .then((data: Album[]) => setCollection(data))
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

  usePageTitle(`${displayName} · ${facet.singular} | Russ.fm`);
  useMetaTags({
    title: `${displayName} · ${facet.singular} | Russ.fm`,
    description: `Albums in the collection from ${displayName} (${albums.length} releases).`,
    image: `${appConfig.siteUrl}/og-image.png`,
    url: `${appConfig.siteUrl}/${facet.singular}/${slug}`,
    type: 'website',
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
          { label: 'Page', value: `${page}/${totalPages}` },
        ]}
      />

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
