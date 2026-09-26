import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import type { FacetConfig } from '@/lib/browseFacets';
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
