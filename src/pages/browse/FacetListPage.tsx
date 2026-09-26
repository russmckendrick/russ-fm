import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { BrowseHeader, FacetCard, type BrowseSection } from '@/components/browse/BrowseHeader';
import {
  byDateAddedDesc,
  floodForUri,
  groupByFacet,
  mostVivid,
  pickSleeves,
} from '@/components/browse/facetSleeves';
import { EditorialEmpty, EditorialSkeleton, PageContainer } from '@/components/layout';
import { FloodBand, SectionHeading, useRecordsFlood } from '@/components/player';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { appConfig } from '@/config/app.config';
import { FACETS, slugify, type FacetKey } from '@/lib/browseFacets';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { useCollection } from '@/lib/collection';
import type { Flood } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';

interface FacetListPageProps {
  facetKey: FacetKey;
}

type SortKey = 'count' | 'name';

/** Up to this many values are all shown as colour cards; above it, the top few are cards and the rest chips. */
const ALL_CARDS_MAX = 12;
const TOP_CARDS = 8;

const TITLES: Record<FacetKey, string> = {
  label: 'Labels',
  decade: 'Decades',
  country: 'Countries',
  genre: 'Genres',
};

interface FacetEntry {
  name: string;
  display: string;
  slug: string;
  count: number;
  albums: Album[];
}

/**
 * Every distinct value for one facet (labels, decades, countries) with its
 * record count. The biggest values are colour cards with a fan of sleeves;
 * the full list follows as chips coloured by a representative sleeve.
 */
export function FacetListPage({ facetKey }: FacetListPageProps) {
  const facet = FACETS[facetKey];
  const title = TITLES[facetKey];
  const { albums: raw, loading } = useCollection();
  const colorMap = useAlbumColorMap();
  const [sort, setSort] = useState<SortKey>(facetKey === 'decade' ? 'name' : 'count');
  const [filter, setFilter] = useState('');

  usePageTitle(`${title} | Russ.fm`);
  useMetaTags({
    title: `${title} | Russ.fm`,
    description: facet.listSubtitle ?? facet.listTitle,
    image: `${appConfig.siteUrl}/og-image.png`,
    url: `${appConfig.siteUrl}/${facet.plural}`,
    type: 'website',
  });

  const albums = useMemo(() => [...excludeBoxsetMembers(raw)].sort(byDateAddedDesc), [raw]);

  const entries = useMemo<FacetEntry[]>(() => {
    const groups = groupByFacet(facet, albums);
    return Array.from(groups.entries())
      .map(([name, list]) => ({
        name,
        display: facet.displayName ? facet.displayName(name) : name,
        slug: slugify(name),
        count: list.length,
        albums: list,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [albums, facet]);

  const floods = useMemo(() => {
    const map = new Map<string, Flood>();
    for (const entry of entries) {
      const lead = mostVivid(entry.albums, a => a.uri_release, colorMap, 60);
      map.set(entry.name, floodForUri(lead?.uri_release, colorMap));
    }
    return map;
  }, [entries, colorMap]);

  const allCards = entries.length <= ALL_CARDS_MAX;
  const cardEntries = useMemo(() => {
    if (!allCards) return entries.slice(0, TOP_CARDS);
    return sort === 'name' ? [...entries].sort((a, b) => a.name.localeCompare(b.name)) : entries;
  }, [allCards, entries, sort]);

  const chipEntries = useMemo(() => {
    if (allCards) return [];
    const q = filter.trim().toLowerCase();
    const list = q ? entries.filter(e => e.display.toLowerCase().includes(q)) : entries;
    return sort === 'name' ? [...list].sort((a, b) => a.display.localeCompare(b.display)) : list;
  }, [allCards, entries, filter, sort]);

  // The header band and page ground take the lead sleeves of the first cards.
  const flood = useRecordsFlood(
    cardEntries.slice(0, 3).map(e => mostVivid(e.albums, a => a.uri_release, colorMap, 60)?.uri_release),
  );

  if (loading) {
    return (
      <PageContainer>
        <EditorialSkeleton label={`Loading ${facet.plural}…`} />
      </PageContainer>
    );
  }

  const sortLabels: Record<SortKey, string> = {
    count: 'Most records',
    name: facetKey === 'decade' ? 'By year' : 'A–Z',
  };

  const sortPills = (
    <div role="group" aria-label="Sort" className="flex flex-wrap gap-2">
      {(Object.keys(sortLabels) as SortKey[]).map(key => (
        <button
          key={key}
          type="button"
          aria-pressed={sort === key}
          onClick={() => setSort(key)}
          className={cn('pill pill-sm', sort === key && 'pill-solid')}
          style={sort === key ? { background: 'var(--cream)', color: 'var(--ground)' } : { borderColor: 'var(--cream-rule)' }}
        >
          {sortLabels[key]}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <FloodBand flood={flood}>
        <BrowseHeader
          className="mb-0 md:mb-0"
          title={title}
          note={`${entries.length.toLocaleString()} · ${albums.length.toLocaleString()} records`}
          current={facet.plural as BrowseSection}
        />
      </FloodBand>

      <PageContainer>
        {entries.length === 0 ? (
          <EditorialEmpty title="Nothing here yet" detail={`No ${facet.plural} found in the collection.`} />
        ) : (
          <>
            <section aria-labelledby="facet-cards" className="mb-14 md:mb-20">
              <SectionHeading
                title={<span id="facet-cards">{allCards ? `All ${facet.plural}` : 'Most records'}</span>}
                size="sm"
                className="mb-6"
              >
                {allCards && sortPills}
              </SectionHeading>
              <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:gap-5 lg:grid-cols-3 xl:grid-cols-4">
                {cardEntries.map(entry => {
                  const fan = pickSleeves(entry.albums, colorMap, 3);
                  return (
                    <li key={entry.name} className="min-w-0">
                      <FacetCard
                        to={`/${facet.singular}/${entry.slug}`}
                        title={entry.display}
                        flood={floodForUri(fan[0]?.uri_release, colorMap)}
                        albums={fan}
                        meta={`${entry.count.toLocaleString()} ${entry.count === 1 ? 'record' : 'records'}`}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>

            {!allCards && (
              <section aria-labelledby="facet-all">
                <SectionHeading
                  title={<span id="facet-all">All {facet.plural}</span>}
                  note={filter ? `${chipEntries.length.toLocaleString()} of ${entries.length.toLocaleString()}` : undefined}
                  size="sm"
                  className="mb-6"
                >
                  {sortPills}
                </SectionHeading>

                <label className="mb-6 flex h-12 w-full max-w-[420px] items-center gap-3 rounded-full border-2 border-[color:var(--cream-rule)] px-4 focus-within:border-[color:var(--cream)]">
                  <Search className="h-[18px] w-[18px] shrink-0 text-[color:var(--cream-dim)]" aria-hidden />
                  <span className="sr-only">Filter {facet.plural}</span>
                  <input
                    type="search"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder={`Filter ${facet.plural}`}
                    className="min-w-0 flex-1 bg-transparent text-[15px] text-[color:var(--cream)] outline-none placeholder:text-[color:var(--cream-dim)] [&::-webkit-search-cancel-button]:hidden"
                  />
                  {filter && (
                    <button
                      type="button"
                      onClick={() => setFilter('')}
                      aria-label="Clear filter"
                      className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[color:var(--ground-3)]"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </label>

                {chipEntries.length === 0 ? (
                  <p className="text-[15px] text-[color:var(--cream-dim)]">No {facet.plural} match “{filter}”.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2.5">
                    {chipEntries.map(entry => {
                      const flood = floods.get(entry.name) ?? floodForUri(null, colorMap);
                      return (
                        <li key={entry.name} className="min-w-0 max-w-full">
                          <Link
                            to={`/${facet.singular}/${entry.slug}`}
                            className="chip min-h-[44px] max-w-full px-4 py-2 text-[15px]"
                            style={{ background: flood.flood, color: flood.ink }}
                          >
                            <span className="truncate">{entry.display}</span>
                            <span className="t-mono text-[12px] font-normal" style={{ color: flood.sub }}>
                              {entry.count.toLocaleString()}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </PageContainer>
    </>
  );
}
