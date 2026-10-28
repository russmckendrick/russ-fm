import { originalYear } from '@/lib/releaseYear';
import { colourSortKey } from '@/lib/sleeveColour';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import type { Album } from '@/types/album';

/**
 * Genre families: the 12 slices of the genre record on /genres.
 *
 * Discogs gives every record a handful of styles and Apple Music adds its own
 * genre names, so the collection carries hundreds of overlapping tags. For the
 * record each album is filed in exactly one family: the first of its styles
 * (Discogs lists the most relevant first) that a family claims, then its
 * genre names. The order of FAMILIES is the order round the disc, clockwise
 * from 12 o'clock, and each family's code reads like a side and track (A1).
 */

import { GENRE_FAMILIES, type GenreFamilyDef, type GenreFamilyKey } from '@/lib/genreFamilyDefs';

export { GENRE_FAMILIES, type GenreFamilyDef, type GenreFamilyKey };

const TERM_TO_FAMILY = new Map<string, GenreFamilyKey>();
for (const family of GENRE_FAMILIES) {
  for (const term of family.terms) {
    if (!TERM_TO_FAMILY.has(term)) TERM_TO_FAMILY.set(term, family.key);
  }
}

export function isGenreFamilyKey(value: string | null | undefined): value is GenreFamilyKey {
  return !!value && GENRE_FAMILIES.some(f => f.key === value);
}

/** The one family a record is filed in. */
export function familyOf(album: Pick<Album, 'styles' | 'genre_names'>): GenreFamilyKey {
  for (const term of album.styles ?? []) {
    const key = TERM_TO_FAMILY.get(term);
    if (key) return key;
  }
  for (const term of album.genre_names ?? []) {
    const key = TERM_TO_FAMILY.get(term);
    if (key) return key;
  }
  return (album.genre_names ?? []).includes('Rock') ? 'hard' : 'pop';
}

export interface TermCount {
  name: string;
  count: number;
}

export interface GenreFamily extends GenreFamilyDef {
  /** Records in disc order: oldest original release first, then by sleeve colour. */
  albums: Album[];
  /** Newest additions first. */
  newest: Album[];
  artistCount: number;
  yearStart: number | null;
  yearEnd: number | null;
  /** Styles inside the family, most common first. */
  styles: TermCount[];
  /** Release artists, most records first. */
  artists: TermCount[];
}

type ColourMap = Record<string, AlbumColorPalette> | null | undefined;

/** Group a collection into the 12 families, in disc order. */
export function buildGenreFamilies(collection: Album[], map: ColourMap): GenreFamily[] {
  const groups = new Map<GenreFamilyKey, Album[]>(GENRE_FAMILIES.map(f => [f.key, []]));
  for (const album of collection) groups.get(familyOf(album))!.push(album);

  return GENRE_FAMILIES.map(def => {
    const albums = groups.get(def.key)!;
    const years = albums.map(originalYear).filter((y): y is number => y !== null);
    const styles = new Map<string, number>();
    const artists = new Map<string, number>();
    for (const album of albums) {
      for (const style of new Set(album.styles ?? [])) styles.set(style, (styles.get(style) ?? 0) + 1);
      artists.set(album.release_artist, (artists.get(album.release_artist) ?? 0) + 1);
    }
    const yearKey = (a: Album) => originalYear(a) ?? 9999;
    return {
      ...def,
      albums: [...albums].sort((a, b) => yearKey(a) - yearKey(b) || colourSortKey(map?.[a.uri_release]) - colourSortKey(map?.[b.uri_release])),
      newest: [...albums].sort((a, b) => (b.date_added || '').localeCompare(a.date_added || '')),
      artistCount: artists.size,
      yearStart: years.length ? Math.min(...years) : null,
      yearEnd: years.length ? Math.max(...years) : null,
      styles: ranked(styles),
      artists: ranked(artists).filter(a => a.name !== 'Various'),
    };
  });
}

function ranked(counts: Map<string, number>): TermCount[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
