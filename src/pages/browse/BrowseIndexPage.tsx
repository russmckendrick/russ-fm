import { useMemo } from 'react';
import { BrowseHeader, FacetCard } from '@/components/browse/BrowseHeader';
import {
  byDateAddedDesc,
  floodForUri,
  groupByFacet,
  pickSleeves,
} from '@/components/browse/facetSleeves';
import { EditorialEmpty, EditorialSkeleton, PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { appConfig } from '@/config/app.config';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { FACETS, type FacetKey } from '@/lib/browseFacets';
import { useCollection } from '@/lib/collection';

const SECTIONS: Array<{ key: FacetKey; to: string; title: string; noun: [string, string] }> = [
  { key: 'genre', to: '/genres', title: 'Genres', noun: ['genre', 'genres'] },
  { key: 'label', to: '/labels', title: 'Labels', noun: ['label', 'labels'] },
  { key: 'decade', to: '/decades', title: 'Decades', noun: ['decade', 'decades'] },
  { key: 'country', to: '/countries', title: 'Countries', noun: ['country', 'countries'] },
];

export function BrowseIndexPage() {
  usePageTitle('Browse | Russ.fm');
  useMetaTags({
    title: 'Browse | Russ.fm',
    description: 'Browse the collection by genre, label, decade or country.',
    image: `${appConfig.siteUrl}/og-image.png`,
    url: `${appConfig.siteUrl}/browse`,
    type: 'website',
  });

  const { albums: raw, loading, error } = useCollection();
  const colorMap = useAlbumColorMap();
  const albums = useMemo(() => excludeBoxsetMembers(raw).sort(byDateAddedDesc), [raw]);

  const cards = useMemo(
    () =>
      SECTIONS.map(section => {
        const groups = groupByFacet(FACETS[section.key], albums);
        let topName = '';
        let top: typeof albums = [];
        for (const [name, list] of groups) {
          if (list.length > top.length) {
            topName = name;
            top = list;
          }
        }
        const fan = pickSleeves(top, colorMap, 5);
        const facet = FACETS[section.key];
        return {
          ...section,
          distinct: groups.size,
          topName: facet.displayName ? facet.displayName(topName) : topName,
          topCount: top.length,
          fan,
          flood: floodForUri(fan[0]?.uri_release, colorMap),
        };
      }),
    [albums, colorMap],
  );

  if (loading) {
    return (
      <PageContainer>
        <EditorialSkeleton label="Loading collection…" />
      </PageContainer>
    );
  }

  if (error || albums.length === 0) {
    return (
      <PageContainer>
        <EditorialEmpty title="Nothing to browse" detail={error ?? 'The collection is empty.'} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <BrowseHeader title="Browse" note={`${albums.length.toLocaleString()} records`} />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
        {cards.map(card => (
          <li key={card.key} className="min-w-0">
            <FacetCard
              to={card.to}
              title={card.title}
              size="lg"
              flood={card.flood}
              albums={card.fan}
              meta={
                <>
                  {card.distinct.toLocaleString()} {card.noun[card.distinct === 1 ? 0 : 1]}
                  {card.topName && (
                    <>
                      {' · '}most: {card.topName} ({card.topCount.toLocaleString()})
                    </>
                  )}
                </>
              }
            />
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
