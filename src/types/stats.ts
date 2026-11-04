/**
 * public/stats/stats.json, built by scripts/generate-stats.ts (scripts/lib/stats-data.ts)
 * from collection.json, every album and artist JSON, album-colors.json and the explore
 * graph. Mostly counted already; `records` is the one per-record list, kept short.
 * Box set members are left out throughout, as on every aggregate page.
 */

/** One record on the shelves. */
export interface StatsRecord {
  /** Album slug */
  s: string;
  t: string;
  by: string;
  /** Artist slugs */
  a: string[];
  /** Date added, YYYY-MM-DD */
  d: string;
  /** Original release year */
  y: number | null;
  /** This pressing's release year */
  p: number | null;
  /** Sleeve flood colour */
  f: string | null;
  /** Genre family key (src/lib/genreFamilyDefs.ts) */
  fam: string;
  /** Last.fm listeners and plays for the album */
  lis: number | null;
  pc: number | null;
}

/** A name with how many records it's on, most first, and up to 14 of those records' slugs. */
export interface StatsRanked {
  name: string;
  n: number;
  s: string[];
  /** Songwriters only: tracks written */
  songs?: number;
}

export interface StatsArtist {
  s: string;
  name: string;
  /** Records on the shelves */
  n: number;
  /** First record added, YYYY-MM-DD */
  first: string;
  /** Lead sleeve colour */
  f: string | null;
  /** ISO alpha-2 home country (explore graph, else TheAudioDB) */
  cc: string | null;
  /** Year formed (groups) or born (people), from TheAudioDB */
  formed: number | null;
  born: number | null;
  /** TheAudioDB says they've split (it gives no year) */
  split: boolean;
  died: number | null;
  mood: string | null;
  /** TheAudioDB: Male, Female or Mixed */
  gender: string | null;
  /** Last.fm listeners */
  lis: number | null;
}

export interface StatsPile {
  yr: string;
  records: number;
  kg: number;
  hours: number;
  coloured: number;
  /** Heaviest record that year */
  heaviest: string;
  /** Last record that year, for the label on top */
  last: string;
  /** Each disc in order added: [size, colour or null for black] */
  discs: Array<[size: string, hex: string | null]>;
}

export interface StatsTotals {
  records: number;
  artists: number;
  kg: number;
  hours: number;
  discs: number;
  tracks: number;
  coloured: number;
  /** Shelf length in metres, at 3.5 mm a sleeve */
  metres: number;
  /** Last.fm plays of the records, summed */
  plays: number;
  /** Records with a Last.fm play count */
  playsKnown: number;
  /** Records under 1,000 Last.fm listeners */
  deep: number;
  /** Oldest and newest original years */
  oldest: number;
  newest: number;
  /** First date added, YYYY-MM-DD */
  since: string;
}

/** A fact for a tag on the /stats shelf, with the record that stands above it. */
export interface StatsHolder {
  /** The figure, e.g. "805 kg" */
  stat: string;
  /** What it counts, e.g. "of vinyl" */
  label: string;
  /** Album slug */
  s: string;
  /** Why this record, e.g. "Heaviest: 2.5 kg" */
  note: string;
}

export interface StatsData {
  generated: string;
  totals: StatsTotals;
  /** The pool of shelf facts; the page shows six at random, each on a different record */
  holders: StatsHolder[];
  families: Array<{ key: string; name: string; colour: string }>;
  /** Records added each year */
  perYear: Record<string, number>;
  records: StatsRecord[];
  artists: StatsArtist[];
  piles: StatsPile[];
  /** Credit boards: cut, mastered, produced, engineered (recorded/mixed), written, labels */
  boards: Record<'written' | 'produced' | 'engineered' | 'mastered' | 'cut' | 'labels', StatsRanked[]>;
  /** Sleeve credits */
  sleeves: { design: StatsRanked[]; photo: StatsRanked[] };
  /** Who owns the recordings, from the Apple Music ℗ line; `known` records had one */
  owners: { known: number; groups: StatsRanked[] };
  /** Pressing details (180 g, 45 RPM, numbered…) */
  specs: StatsRanked[];
  /** Last.fm's most-used tags on the records */
  tags: Array<{ name: string; n: number }>;
}
