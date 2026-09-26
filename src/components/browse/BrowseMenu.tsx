import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { FacetFan } from '@/components/browse/BrowseHeader';
import { byDateAddedDesc, floodForUri, pickSleeves, summariseFacet } from '@/components/browse/facetSleeves';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import type { FacetKey } from '@/lib/browseFacets';
import { useCollection } from '@/lib/collection';
import type { Flood } from '@/lib/sleeveColour';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import type { Album } from '@/types/album';

const FACET_CARDS: Array<{ key: FacetKey; to: string; title: string; noun: [string, string] }> = [
  { key: 'label', to: '/labels', title: 'Labels', noun: ['label', 'labels'] },
  { key: 'decade', to: '/decades', title: 'Decades', noun: ['decade', 'decades'] },
  { key: 'country', to: '/countries', title: 'Countries', noun: ['country', 'countries'] },
];

/** Hue distance on the colour wheel (0–0.5). */
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

/**
 * Pick the most vivid sleeve whose hue is clear of the cards already coloured,
 * so the four cards don't all come out red. Returns the fan with that sleeve
 * leading, or the fan unchanged when nothing qualifies.
 */
function withDistinctLead(
  fan: Album[],
  candidates: Album[],
  map: Record<string, AlbumColorPalette> | null,
  used: number[],
): Album[] {
  let best: { album: Album; palette: AlbumColorPalette } | null = null;
  for (const album of candidates.slice(0, 240)) {
    const palette = map?.[album.uri_release];
    if (!palette?.vivid) continue;
    if (used.some(h => hueGap(h, palette.hue) < 0.09)) continue;
    if (!best || palette.vivid > best.palette.vivid) best = { album, palette };
  }
  if (!best) return fan;
  used.push(best.palette.hue);
  const lead = best.album;
  return [lead, ...fan.filter(a => a.uri_release !== lead.uri_release)].slice(0, 3);
}

interface Card {
  to: string;
  title: string;
  meta: string;
  fan: Album[];
  flood: Flood;
}

/**
 * The Browse dropdown: one card per way into the collection, each painted in
 * the colour of the sleeve fanned across it. Rendered only while the menu is
 * open, so the facet grouping costs nothing until someone asks for it.
 */
export function BrowseMenuCards({ isActive }: { isActive: (path: string) => boolean }) {
  const { albums: raw } = useCollection();
  const colorMap = useAlbumColorMap();

  const cards = useMemo<Card[]>(() => {
    const albums = [...excludeBoxsetMembers(raw)].sort(byDateAddedDesc);
    if (!albums.length) return [];
    const used: number[] = [];
    const overviewFan = withDistinctLead(pickSleeves(albums, colorMap, 3), albums, colorMap, used);
    return [
      {
        to: '/browse',
        title: 'Overview',
        meta: `${albums.length.toLocaleString()} records`,
        fan: overviewFan,
        flood: floodForUri(overviewFan[0]?.uri_release, colorMap),
      },
      ...FACET_CARDS.map(card => {
        const summary = summariseFacet(card.key, albums, colorMap, 3);
        const fan = withDistinctLead(summary.fan, summary.topAlbums, colorMap, used);
        return {
          to: card.to,
          title: card.title,
          meta: `${summary.distinct.toLocaleString()} ${card.noun[summary.distinct === 1 ? 0 : 1]}`,
          fan,
          flood: floodForUri(fan[0]?.uri_release, colorMap),
        };
      }),
    ];
  }, [raw, colorMap]);

  if (!cards.length) {
    return <div className="h-[232px] w-full rounded-[18px] bg-[color:var(--ground-3)]" aria-busy="true" />;
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map(card => (
        <DropdownMenuItem key={card.to} asChild className="p-0 focus:bg-transparent">
          <Link
            to={card.to}
            aria-current={isActive(card.to) ? 'page' : undefined}
            className="group relative flex h-[232px] cursor-pointer flex-col gap-2 overflow-hidden rounded-[18px] p-5 outline-none transition-transform duration-500 [transition-timing-function:var(--ease-out)] hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[color:var(--cream)]"
            style={{ background: card.flood.flood, color: card.flood.ink }}
          >
            <span className="flex items-center justify-between">
              <span className="t-disp text-[20px]">{card.title}</span>
              <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-1" aria-hidden />
            </span>
            <span className="t-mono text-[12px] font-bold opacity-80">{card.meta}</span>
            <FacetFan albums={card.fan} className="pointer-events-none absolute left-0 top-[84px] w-full" />
          </Link>
        </DropdownMenuItem>
      ))}
    </div>
  );
}
