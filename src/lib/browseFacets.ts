import type { Album } from '@/types/album';
import { getCleanGenreTermsFromAlbum } from '@/lib/genreUtils';

export type FacetKey = 'label' | 'decade' | 'country' | 'genre';

export interface FacetValue {
  slug: string;
  name: string;
  count: number;
}

export interface FacetConfig {
  key: FacetKey;
  /** Plural route segment, e.g. "labels". */
  plural: string;
  /** Singular route segment, e.g. "label". */
  singular: string;
  /** Heading copy shown on the index/list page. */
  listTitle: string;
  listKicker: string;
  detailKicker: string;
  /** Pull every applicable facet value for one album (one album → many labels). */
  extract: (album: Album) => string[];
  /** Display name renderer for one slug (e.g. "1980s" → "The 1980s"). Default: identity. */
  displayName?: (raw: string) => string;
  /** Optional copy under the index hero. */
  listSubtitle?: string;
}

/**
 * URL-safe slug. Lower-case, hyphenated, ASCII-only ish — keeps unicode letters.
 * Decade values like "1980s" survive verbatim.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function decadeFromAlbum(album: Album): string[] {
  const year = new Date(album.date_release_year).getFullYear();
  if (Number.isNaN(year) || year < 1900) return [];
  const decade = Math.floor(year / 10) * 10;
  return [`${decade}s`];
}

export const FACETS: Record<FacetKey, FacetConfig> = {
  label: {
    key: 'label',
    plural: 'labels',
    singular: 'label',
    listTitle: 'Browse by record label',
    listKicker: 'Browse · russ.fm / labels',
    detailKicker: 'Label dossier',
    extract: (album) => album.labels ?? [],
    listSubtitle: 'Every imprint represented in the collection, ranked by release count.',
  },
  decade: {
    key: 'decade',
    plural: 'decades',
    singular: 'decade',
    listTitle: 'Browse by decade',
    listKicker: 'Browse · russ.fm / decades',
    detailKicker: 'Decade dossier',
    extract: decadeFromAlbum,
    displayName: (raw) => `The ${raw}`,
    listSubtitle: 'Slice the collection by the decade each record was first released.',
  },
  country: {
    key: 'country',
    plural: 'countries',
    singular: 'country',
    listTitle: 'Browse by country of origin',
    listKicker: 'Browse · russ.fm / countries',
    detailKicker: 'Country dossier',
    extract: (album) => (album.country ? [album.country] : []),
    listSubtitle: 'Where each pressing came from, by Discogs release country.',
  },
  genre: {
    key: 'genre',
    plural: 'genres',
    singular: 'genre',
    listTitle: 'Browse by genre',
    listKicker: 'Browse · russ.fm / genres',
    detailKicker: 'Genre dossier',
    extract: getCleanGenreTermsFromAlbum,
    listSubtitle: 'Albums grouped by genre and style across the collection.',
  },
};

/**
 * Build the sorted list of facet values + counts for a given facet across the collection.
 */
export function buildFacetValues(facet: FacetConfig, collection: Album[]): FacetValue[] {
  const counts = new Map<string, number>();
  for (const album of collection) {
    for (const raw of facet.extract(album)) {
      if (!raw) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, slug: slugify(name), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Filter a collection down to albums that match a given facet slug.
 * Slug match is performed against the slugified value of every extracted value.
 */
export function albumsForFacetSlug(
  facet: FacetConfig,
  collection: Album[],
  slug: string,
): { match: FacetValue | null; albums: Album[] } {
  const target = slug.toLowerCase();
  let matchName: string | null = null;
  const albums = collection.filter((album) => {
    return facet.extract(album).some((raw) => {
      if (slugify(raw) === target) {
        if (!matchName) matchName = raw;
        return true;
      }
      return false;
    });
  });
  return {
    match: matchName ? { name: matchName, slug: target, count: albums.length } : null,
    albums,
  };
}
