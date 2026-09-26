import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { FACETS, type FacetConfig, type FacetKey } from '@/lib/browseFacets';
import { floodFor, type Flood } from '@/lib/sleeveColour';
import type { Album } from '@/types/album';

/**
 * Helpers for colouring browse surfaces (facet cards, chips, detail floods)
 * from a representative sleeve. Everything reads album-colors.json through the
 * map returned by useAlbumColorMap().
 */

export type ColourMap = Record<string, AlbumColorPalette> | null | undefined;

/** How vivid a sleeve's best colour is (0 when it has no usable colour). */
export function sleeveVividness(uri: string, map: ColourMap): number {
  return map?.[uri]?.vivid ?? 0;
}

/**
 * The most vivid item among the first `limit` entries. Callers pass lists
 * sorted by recency, so ties go to the most recently added record.
 */
export function mostVivid<T>(items: T[], uriOf: (item: T) => string, map: ColourMap, limit = 240): T | null {
  let best: T | null = items[0] ?? null;
  let bestScore = -1;
  const n = Math.min(items.length, limit);
  for (let i = 0; i < n; i++) {
    const score = sleeveVividness(uriOf(items[i]), map);
    if (score > bestScore) {
      best = items[i];
      bestScore = score;
    }
  }
  return best;
}

/**
 * Sleeves for a fan: the most vivid record first (it sets the flood colour),
 * then recent records from different artists.
 */
export function pickSleeves<T extends Pick<Album, 'uri_release' | 'release_artist'>>(
  albums: T[],
  map: ColourMap,
  count = 5,
): T[] {
  const lead = mostVivid(albums, a => a.uri_release, map);
  if (!lead) return [];
  const picked: T[] = [lead];
  const artists = new Set([lead.release_artist]);
  for (const album of albums) {
    if (picked.length >= count) break;
    if (album === lead || artists.has(album.release_artist)) continue;
    artists.add(album.release_artist);
    picked.push(album);
  }
  for (const album of albums) {
    if (picked.length >= count) break;
    if (!picked.includes(album)) picked.push(album);
  }
  return picked;
}

/** Flood colours for a record by uri. */
export function floodForUri(uri: string | null | undefined, map: ColourMap): Flood {
  return floodFor(uri ? map?.[uri] : null);
}

/** Newest first, by date added. */
export function byDateAddedDesc<T extends Pick<Album, 'date_added'>>(a: T, b: T): number {
  return new Date(b.date_added).getTime() - new Date(a.date_added).getTime();
}

/** Group the collection by every value of one facet (an album can sit in several). */
export function groupByFacet(facet: FacetConfig, albums: Album[]): Map<string, Album[]> {
  const groups = new Map<string, Album[]>();
  for (const album of albums) {
    for (const raw of facet.extract(album)) {
      if (!raw) continue;
      const list = groups.get(raw);
      if (list) list.push(album);
      else groups.set(raw, [album]);
    }
  }
  return groups;
}

export interface FacetSummary<T extends Album = Album> {
  /** How many distinct values the facet has (labels, decades, …). */
  distinct: number;
  /** The value with the most records, as displayed. */
  topName: string;
  topCount: number;
  /** Every record under the top value, in the order given. */
  topAlbums: T[];
  /** Sleeves for a fan from the top value, most vivid first. */
  fan: T[];
  flood: Flood;
}

/**
 * Summarise one facet for a browse card: its size, its biggest value and a fan
 * of sleeves from that value. `albums` should be sorted newest first.
 */
export function summariseFacet(key: FacetKey, albums: Album[], map: ColourMap, fanSize = 5): FacetSummary {
  const facet = FACETS[key];
  const groups = groupByFacet(facet, albums);
  let topName = '';
  let top: Album[] = [];
  for (const [name, list] of groups) {
    if (list.length > top.length) {
      topName = name;
      top = list;
    }
  }
  const fan = pickSleeves(top, map, fanSize);
  return {
    distinct: groups.size,
    topName: facet.displayName ? facet.displayName(topName) : topName,
    topCount: top.length,
    topAlbums: top,
    fan,
    flood: floodForUri(fan[0]?.uri_release, map),
  };
}

/**
 * Title sizing: scale to the longest word so long names never overflow. The
 * column width comes from a `--title-col` custom property on the element (or
 * an ancestor), falling back to most of the viewport.
 */
export function heroTitleStyle(title: string, maxPx = 150): { condensed: boolean; fontSize: string } {
  const longest = title.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 1);
  const condensed = title.length > 14 || longest > 10;
  const factor = condensed ? 0.52 : 0.95;
  return {
    condensed,
    fontSize: `min(${maxPx}px, calc(var(--title-col, min(88vw, 760px)) / ${(longest * factor).toFixed(2)}))`,
  };
}
