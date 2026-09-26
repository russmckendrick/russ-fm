/**
 * Boxset membership helpers.
 *
 * Boxset members are full collection.json entries (own page, artwork, search presence) that
 * carry a `boxset` link to their parent. Aggregate surfaces — stats, recently added, browse
 * listings, wrapped — must exclude them so a boxset never double-counts against its contents.
 * Search, album detail pages, and artist discographies keep the unfiltered collection.
 */

interface MaybeBoxsetMember {
  boxset?: unknown;
}

/** True when the album is a member of a boxset (linked via `boxset` in collection.json). */
export function isBoxsetMember(album: MaybeBoxsetMember): boolean {
  return album.boxset != null;
}

const withoutMembers = new WeakMap<object[], object[]>();

/**
 * The collection without boxset members — use for stats, recents, and browse aggregates.
 * Memoised per input array so every page gets the same filtered array back, which
 * keeps downstream caches (e.g. the genre explorer) warm across navigations.
 */
export function excludeBoxsetMembers<T extends MaybeBoxsetMember>(albums: T[]): T[] {
  let out = withoutMembers.get(albums) as T[] | undefined;
  if (!out) {
    out = albums.filter(album => !isBoxsetMember(album));
    withoutMembers.set(albums, out);
  }
  return out;
}
