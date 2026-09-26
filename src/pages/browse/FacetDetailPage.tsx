import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { FacetFan } from '@/components/browse/BrowseHeader';
import { byDateAddedDesc, floodForUri, heroTitleStyle, pickSleeves } from '@/components/browse/facetSleeves';
import { EditorialEmpty, EditorialSkeleton, PageContainer } from '@/components/layout';
import { RecordTile, SectionHeading, usePageFlood } from '@/components/player';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { appConfig } from '@/config/app.config';
import { albumsForFacetSlug, FACETS, type FacetKey } from '@/lib/browseFacets';
import { originalYear } from '@/lib/releaseYear';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { useCollection } from '@/lib/collection';
import { cn } from '@/lib/utils';
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

type SortKey = 'added' | 'year' | 'title';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'added', label: 'Recently added' },
  { key: 'year', label: 'Release year' },
  { key: 'title', label: 'A–Z' },
];

const FACET_LABEL: Record<FacetKey, string> = {
  label: 'Labels',
  decade: 'Decades',
  country: 'Countries',
  genre: 'Genres',
};

function releaseYear(album: Album): number {
  return originalYear(album) ?? 0;
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
    const y = releaseYear(album);
    if (y) {
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

function sortAlbums(albums: Album[], sort: SortKey): Album[] {
  if (sort === 'added') return albums;
  const copy = [...albums];
  if (sort === 'year') {
    copy.sort((a, b) => releaseYear(b) - releaseYear(a) || a.release_name.localeCompare(b.release_name));
  } else {
    copy.sort((a, b) => a.release_name.trim().localeCompare(b.release_name.trim()));
  }
  return copy;
}

/**
 * One label / decade / country / genre. Opens with a flood in the colour of
 * its most vivid sleeve and a fan of records, then the full record grid.
 */
export function FacetDetailPage({ facetKey }: FacetDetailPageProps) {
  const facet = FACETS[facetKey];
  const { slug } = useParams<{ slug: string }>();
  const { albums: raw, loading } = useCollection();
  const colorMap = useAlbumColorMap();
  // Page and sort reset whenever the slug changes.
  const [view, setView] = useState<{ slug?: string; page: number; sort: SortKey }>({ slug, page: 1, sort: 'added' });
  const page = view.slug === slug ? view.page : 1;
  const sort = view.slug === slug ? view.sort : 'added';
  const gridRef = useRef<HTMLElement>(null);
  const itemsPerPage = appConfig.pagination.itemsPerPage.albums;

  const collection = useMemo(() => excludeBoxsetMembers(raw), [raw]);

  const { match, albums } = useMemo(() => {
    if (!collection.length || !slug) return { match: null, albums: [] as Album[] };
    const result = albumsForFacetSlug(facet, collection, slug);
    return { match: result.match, albums: [...result.albums].sort(byDateAddedDesc) };
  }, [collection, slug, facet]);

  const displayName = match ? (facet.displayName ? facet.displayName(match.name) : match.name) : slug ?? '';

  const stats = useMemo(() => buildFacetStats(albums), [albums]);
  const intro = match ? buildFacetIntro(facetKey, displayName, stats) : '';
  const meta = match && slug ? buildFacetMeta(facetKey, facet.singular, displayName, slug, intro) : null;

  const fan = useMemo(() => pickSleeves(albums, colorMap, 5), [albums, colorMap]);
  const flood = floodForUri(fan[0]?.uri_release, colorMap);
  const ready = Boolean(match && colorMap);
  usePageFlood(ready ? flood.flood : null, ready ? flood.ink : null, ready ? { ground: flood.ground } : undefined);

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

  const sorted = useMemo(() => sortAlbums(albums, sort), [albums, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * itemsPerPage;
  const paginated = sorted.slice(startIndex, startIndex + itemsPerPage);

  const goToPage = (next: number) => {
    setView({ slug, sort, page: Math.min(Math.max(1, next), totalPages) });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gridRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  if (loading) {
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

  const titleStyle = heroTitleStyle(displayName, 160);
  const years = stats.decadeRange
    ? stats.decadeRange.first === stats.decadeRange.last
      ? String(stats.decadeRange.first)
      : `${stats.decadeRange.first}–${stats.decadeRange.last}`
    : null;

  return (
    <div className="text-[color:var(--cream)]">
      <section
        className="flood-surface relative z-[2] overflow-x-clip"
        style={{ background: flood.flood, color: flood.ink }}
        aria-labelledby="facet-title"
      >
        <div className="mx-auto grid w-full max-w-[1640px] gap-8 px-5 pt-4 md:px-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-end lg:gap-12 lg:px-14 lg:pt-10">
          <div className="min-w-0 lg:pb-24">
            <Link
              to={`/${facet.plural}`}
              className="t-kicker -ml-1 inline-flex min-h-[44px] items-center gap-2 px-1 opacity-80 transition-opacity hover:opacity-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {FACET_LABEL[facetKey]}
            </Link>
            <h1
              id="facet-title"
              className={cn(
                titleStyle.condensed ? 't-cond' : 't-disp',
                'mt-4 break-words [--title-col:calc(100vw-40px)] md:[--title-col:calc(100vw-80px)] lg:[--title-col:min(44vw,720px)]',
              )}
              style={{ fontSize: titleStyle.fontSize }}
            >
              {displayName}
            </h1>
            <p className="t-mono mt-6 text-[13px] uppercase md:text-[14px]" style={{ color: flood.sub }}>
              {stats.albumCount.toLocaleString()} {stats.albumCount === 1 ? 'record' : 'records'}
              {' · '}
              {stats.artistCount.toLocaleString()} {stats.artistCount === 1 ? 'artist' : 'artists'}
              {years && ` · ${years}`}
            </p>
            {stats.topArtists.length > 1 && (
              <div className="mt-6">
                <h2 className="t-kicker mb-3" style={{ color: flood.sub }}>
                  Most collected
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {stats.topArtists.slice(0, 5).map(artist => (
                    <li key={artist.uri} className="min-w-0 max-w-full">
                      <Link to={artist.uri} className="pill pill-sm max-w-full">
                        <span className="truncate">{artist.name}</span>
                        <span className="t-mono text-[12px] font-normal opacity-70">{artist.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="relative -mb-20 w-full max-w-[560px] justify-self-center md:-mb-24 lg:-mb-28 lg:max-w-[720px]">
            <FacetFan albums={fan} linked large className="group" />
          </div>
        </div>
      </section>

      <section
        ref={gridRef}
        aria-labelledby="facet-records"
        className="mx-auto w-full max-w-[1640px] scroll-mt-24 px-5 pb-16 pt-28 md:px-10 md:pt-32 lg:px-14 lg:pt-40"
      >
        <SectionHeading
          title={<span id="facet-records">Records</span>}
          note={totalPages > 1 ? `${startIndex + 1}–${startIndex + paginated.length} of ${sorted.length.toLocaleString()}` : sorted.length.toLocaleString()}
          size="sm"
          className="mb-8"
        >
          <div role="group" aria-label="Sort records" className="flex flex-wrap gap-2">
            {SORTS.map(option => (
              <button
                key={option.key}
                type="button"
                aria-pressed={sort === option.key}
                onClick={() => setView({ slug, page: 1, sort: option.key })}
                className={cn('pill pill-sm', sort === option.key && 'pill-solid')}
                style={sort === option.key ? { background: 'var(--cream)', color: 'var(--ground)' } : { borderColor: 'var(--cream-rule)' }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </SectionHeading>

        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:gap-x-6 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {paginated.map(album => {
            const year = releaseYear(album);
            return (
              <li key={album.uri_release} className="min-w-0">
                <RecordTile album={album} palette={colorMap?.[album.uri_release]} meta={year ? String(year) : undefined} />
              </li>
            );
          })}
        </ul>

        {totalPages > 1 && <Pager page={safePage} total={totalPages} onChange={goToPage} />}
      </section>
    </div>
  );
}

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pages = Array.from({ length: total }, (_, i) => i + 1).filter(n => n === 1 || n === total || Math.abs(n - page) <= 1);
  return (
    <nav aria-label="Pages" className="mt-14 flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className="icon-btn border-2 border-[color:var(--cream-rule)] disabled:opacity-30"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      {pages.map((n, i) => (
        <span key={n} className="flex items-center gap-2">
          {i > 0 && n - pages[i - 1] > 1 && <span className="t-mono px-1 text-[color:var(--cream-dim)]" aria-hidden>…</span>}
          <button
            type="button"
            onClick={() => onChange(n)}
            aria-current={n === page ? 'page' : undefined}
            aria-label={`Page ${n}`}
            className={cn(
              't-mono inline-flex h-12 min-w-12 items-center justify-center rounded-full px-3 text-[14px] font-bold transition-colors',
              n === page
                ? 'bg-[color:var(--cream)] text-[color:var(--ground)]'
                : 'text-[color:var(--cream-dim)] hover:bg-[color:var(--ground-3)] hover:text-[color:var(--cream)]',
            )}
          >
            {n}
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === total}
        aria-label="Next page"
        className="icon-btn border-2 border-[color:var(--cream-rule)] disabled:opacity-30"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </nav>
  );
}
