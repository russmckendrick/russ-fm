import { useMemo } from 'react';
import { BrowseHeader, FacetCard } from '@/components/browse/BrowseHeader';
import { byDateAddedDesc, summariseFacet } from '@/components/browse/facetSleeves';
import { EditorialEmpty, EditorialSkeleton, PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { appConfig } from '@/config/app.config';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import type { FacetKey } from '@/lib/browseFacets';
import { useCollection } from '@/lib/collection';
import { FloodBand, useRecordsFlood } from '@/components/player';

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
  const albums = useMemo(() => [...excludeBoxsetMembers(raw)].sort(byDateAddedDesc), [raw]);

  const cards = useMemo(
    () => SECTIONS.map(section => ({ ...section, ...summariseFacet(section.key, albums, colorMap) })),
    [albums, colorMap],
  );

  // The header band and page ground take the cards' lead sleeves.
  const flood = useRecordsFlood(cards.map(card => card.fan[0]?.uri_release));

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
    <>
      <FloodBand flood={flood}>
        <BrowseHeader className="mb-0 md:mb-0" title="Browse" note={`${albums.length.toLocaleString()} records`} />
      </FloodBand>

      <PageContainer>
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
    </>
  );
}
