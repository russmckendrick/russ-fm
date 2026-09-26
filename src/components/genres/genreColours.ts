import { floodForUri, mostVivid, type ColourMap } from '@/components/browse/facetSleeves';
import type { Flood } from '@/lib/sleeveColour';
import type { GenreExplorerAlbum, GenreExplorerArtist, GenreSummary } from '@/lib/genreExplorer';

/**
 * Sleeve colours for the genre atlas and network graph. A genre or artist
 * takes the flood of its most vivid recent record; an album its own sleeve.
 */

const genreCache = new WeakMap<object, WeakMap<GenreSummary, { flood: Flood; lead: GenreExplorerAlbum | null }>>();
const NO_MAP = {};

/** Explorer uris drop the trailing slash that album-colors.json keys keep. */
function colourKey(album: GenreExplorerAlbum): string {
  return album.uri.endsWith('/') ? album.uri : `${album.uri}/`;
}

function albumsByRecency(albums: GenreExplorerAlbum[]): GenreExplorerAlbum[] {
  return [...albums].sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
}

/** Flood colours and lead record for a genre (cached per genre object). */
export function genreLead(genre: GenreSummary, map: ColourMap): { flood: Flood; lead: GenreExplorerAlbum | null } {
  const key = map ?? NO_MAP;
  let byGenre = genreCache.get(key);
  if (!byGenre) {
    byGenre = new WeakMap();
    genreCache.set(key, byGenre);
  }
  const cached = byGenre.get(genre);
  if (cached) return cached;
  const pool = genre.albums?.length ? albumsByRecency(genre.albums) : genre.coverSamples ?? [];
  const lead = mostVivid(pool, colourKey, map, 160);
  const result = { flood: floodForUri(lead ? colourKey(lead) : null, map), lead };
  byGenre.set(genre, result);
  return result;
}

export function genreFlood(genre: GenreSummary, map: ColourMap): Flood {
  return genreLead(genre, map).flood;
}

export function albumFlood(album: GenreExplorerAlbum, map: ColourMap): Flood {
  return floodForUri(colourKey(album), map);
}

export function artistFlood(artist: GenreExplorerArtist, map: ColourMap): Flood {
  const pool = artist.representativeAlbums?.length ? artist.representativeAlbums : artist.albums ?? [];
  const lead = mostVivid(pool, colourKey, map, 24);
  return floodForUri(lead ? colourKey(lead) : null, map);
}
