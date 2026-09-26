/**
 * Release years.
 *
 * `date_release_year` in collection.json is often a reissue date: the year of
 * the pressing Russ owns, or a streaming service listing the remaster. The
 * scrapper adds `year_original`, the original release year from the Discogs
 * master (or the earliest year any source reports). Use `originalYear()` for
 * anything that orders, groups, filters or labels records by year.
 */

interface HasYears {
  year_original?: number | null;
  date_release_year?: string | null;
}

/** The year the record first came out, or null when unknown. */
export function originalYear(album: HasYears): number | null {
  if (typeof album.year_original === 'number' && album.year_original > 1800) return album.year_original;
  const y = Number.parseInt(String(album.date_release_year ?? '').slice(0, 4), 10);
  return Number.isFinite(y) && y > 1900 ? y : null;
}

/** "1970s" for a record's original year, or null when unknown. */
export function originalDecade(album: HasYears): string | null {
  const y = originalYear(album);
  return y === null ? null : `${Math.floor(y / 10) * 10}s`;
}
