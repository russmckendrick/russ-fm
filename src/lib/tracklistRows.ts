/**
 * What kind of row a Discogs tracklist row is, and which side it plays on.
 *
 * The scrapper keeps the Discogs row type on rows that aren't plain tracks:
 *
 * - `type: "heading"` — a side, disc or box set album title ("Bonus Tracks", "Low").
 * - `type: "index"` — a suite ("2112", "Supper's Ready"). Its movements follow it as ordinary
 *   tracks with `parent` set to the suite's title, and positions such as "A-I", "B2 i",
 *   "A1.1", "A3-a" or "A2a".
 *
 * Rows scraped before that carry neither, so a position-less row is still read as a heading.
 */
export interface TracklistRowShape {
  position?: string | null;
  duration_ms?: number;
  type?: string;
  parent?: string;
}

export const isSuiteRow = (row: TracklistRowShape): boolean => row.type === 'index';

/** A section heading: typed as one, or (older records) a position-less, untimed row. */
export const isHeadingRow = (row: TracklistRowShape): boolean =>
  row.type === 'heading' || (!row.type && !row.parent && !row.position?.trim() && !row.duration_ms);

/**
 * A movement's position without its movement suffix ("A-I" → "A", "B2 i" → "B2",
 * "A1.1" → "A1", "A3-a" → "A3", "A2a" → "A2", "2-4.1" → "2-4"), so it sides like the track
 * it is part of. Other rows keep their position.
 */
export function basePosition(row: TracklistRowShape): string {
  const position = (row.position ?? '').trim();
  if (!row.parent) return position;
  return position.replace(/(?:[-. ]?(?:[ivx]+|[IVX]+)|[-. ]?[a-z]|\.\d+)$/, '') || position;
}

/** The vinyl side of a position ("A1", "B", a movement's base "A"), or null for CD/digital. */
export function vinylSide(position: string | null | undefined): string | null {
  const m = /^([A-Z])(?=\d|$)/.exec((position ?? '').trim());
  return m ? m[1] : null;
}

/**
 * The position that decides a row's side or disc: a movement's base position, and a suite
 * row the position of its first movement (suites have none of their own).
 */
export function sidingPosition<T extends TracklistRowShape & { name?: string }>(rows: T[], index: number): string {
  const row = rows[index];
  if (isSuiteRow(row)) {
    const next = rows[index + 1];
    return next?.parent ? basePosition(next) : '';
  }
  return basePosition(row);
}
