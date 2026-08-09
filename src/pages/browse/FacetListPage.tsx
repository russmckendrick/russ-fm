import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrowseHeader } from '@/components/browse/BrowseHeader';
import { EditorialEmpty, EditorialSkeleton, PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { appConfig } from '@/config/app.config';
import { buildFacetValues, FACETS, type FacetKey } from '@/lib/browseFacets';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import type { Album } from '@/types/album';

interface FacetListPageProps {
  facetKey: FacetKey;
}

/**
 * Lists every distinct value for one facet (labels, decades, countries) with
 * album counts. Each entry deep-links into the matching detail page.
 */
export function FacetListPage({ facetKey }: FacetListPageProps) {
  const facet = FACETS[facetKey];
  const [collection, setCollection] = useState<Album[] | null>(null);

  usePageTitle(`${facet.listTitle} | Russ.fm`);
  useMetaTags({
    title: `${facet.listTitle} | Russ.fm`,
    description: facet.listSubtitle ?? facet.listTitle,
    image: `${appConfig.siteUrl}/og-image.png`,
    url: `${appConfig.siteUrl}/${facet.plural}`,
    type: 'website',
  });

  useEffect(() => {
    fetch('/collection.json')
      .then((r) => r.json())
      .then((data: Album[]) => setCollection(excludeBoxsetMembers(data)))
      .catch(() => setCollection([]));
  }, []);

  const values = useMemo(() => (collection ? buildFacetValues(facet, collection) : []), [collection, facet]);

  if (!collection) {
    return (
      <PageContainer>
        <EditorialSkeleton label={`Loading ${facet.plural}…`} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <BrowseHeader
        num="00"
        kicker={facet.listKicker}
        title={facet.listTitle}
        subtitle={facet.listSubtitle}
        counts={[
          { label: 'Distinct', value: values.length.toLocaleString() },
          { label: 'Albums', value: collection.length.toLocaleString() },
        ]}
      />

      {values.length === 0 ? (
        <EditorialEmpty title="Nothing to show yet" detail="No values found for this facet." />
      ) : (
        <ol className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((v, i) => (
            <li key={`${v.name}::${v.slug}`}>
              <Link
                to={`/${facet.singular}/${v.slug}`}
                className="group grid grid-cols-[28px_minmax(0,1fr)_48px] items-baseline gap-3 border-b border-rule py-2 transition-colors hover:border-ink"
              >
                <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="truncate font-grot text-[15px] tracking-[-0.005em] text-ink group-hover:text-hl">
                  {facet.displayName ? facet.displayName(v.name) : v.name}
                </span>
                <span className="text-right font-mono text-[11px] tabular-nums text-ink-dim">
                  {v.count}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </PageContainer>
  );
}
