/**
 * The `story` block of public/wrapped/wrapped-YYYY.json: everything the Wrapped
 * chapters draw, flattened per record by scripts/lib/wrapped-story.ts. No imports,
 * so the build script can share it. Short keys keep the file small.
 */

export interface StoryVinyl {
  /** Discogs colour text, e.g. "Red (Battery Brick)" */
  n: string;
  /** Up to three colours from src/config/vinyl-colours.json */
  hex: string[];
  /** Clear / crystal: see-through glass */
  glass: boolean;
  /** Clear or translucent */
  see: boolean;
  /** marble, splatter, swirl, smoke… */
  pat: string | null;
}

export interface StoryRelease {
  /** Album slug */
  s: string;
  t: string;
  by: string;
  /** Artist slugs */
  a: string[];
  /** Date added, YYYY-MM-DD */
  d: string;
  /** Hour added, UK time, as a fraction (13.5 = 1.30 pm) */
  h: number | null;
  /** Weekday added, UK time, 0 = Monday */
  wd: number | null;
  /** Original release year */
  y: number | null;
  g: string[];
  st: string[];
  /** Genre family key (src/lib/genreFamilyDefs.ts) */
  fam: string;
  c: { flood?: string; ink?: string; ground?: string; secondary?: string | null; hue?: number; vivid?: number };
  /** Run time in seconds, when at least 60% of tracks have times */
  rt: number | null;
  tracks: number;
  discs: number;
  /** 12", 10" or 7" */
  size: string;
  /** Vinyl weight in grams (pressing weight when Discogs gives one) */
  g_wt: number;
  vc: StoryVinyl[];
  /** Edition flags: Limited Edition, Reissue, Record Store Day… */
  ed: string[];
  lab: string | null;
  ctry: string | null;
  /** Lacquer cut by */
  cut: string[];
  /** Mastered / remastered by */
  mas: string[];
  prod: string[];
  lis: number | null;
}

export interface StoryArtist {
  s: string;
  name: string;
  /** Records added this year */
  n: number;
  /** First time on the shelves */
  new: boolean;
  /** Fanart file name from the artist's -image.json */
  fanart: string | null;
  /** Face focus [x, y] as fractions */
  focus: [number, number] | null;
  from: string | null;
  formed: number | null;
  cc: string | null;
}

export interface StoryLink {
  a: string;
  b: string;
  /** member, group, bandmate, alias, credit, shared-credit */
  type: string;
  who: string | null;
}

export interface WrappedStory {
  releases: StoryRelease[];
  artists: StoryArtist[];
  links: StoryLink[];
  /** Older collection artists the links reach */
  outside: Array<{ s: string; name: string }>;
  /** Records added each year, for the cover's comparison strip */
  perYear: Record<string, number>;
  /** Records added each month, per year (12 counts; the latest year stops at its last month) */
  perMonth: Record<string, number[]>;
}
