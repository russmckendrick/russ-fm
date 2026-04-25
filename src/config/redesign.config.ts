/**
 * Redesign-specific tunables.
 *
 * This config is additive to `app.config.ts` — it introduces knobs that
 * only exist in the editorial redesign (density, tint, mono labels, wall
 * counts, stats counts). User-facing pagination and hero rotation continue
 * to live in `appConfig`.
 */

export type Density = 'sparse' | 'medium' | 'dense';
export type ThemeDefault = 'light' | 'dark' | 'system';
export type HeroVariant = 'split' | 'stacked';
export type ThemeMode = 'paper' | 'stage' | 'mixed';
export type MotionLevel = 'reduced' | 'measured' | 'expressive';

export const redesignConfig = {
  visual: {
    themeMode: 'mixed' as ThemeMode,
    stageHero: true,
    showVinylDisc: true,
    motion: 'measured' as MotionLevel,
  },

  hero: {
    variant: 'split' as HeroVariant,
  },

  /** Feature-page hero copy. Counts and query-specific fragments stay local
   * to each page, but the displayed editorial wording lives here so it can
   * be changed without hunting through route components. */
  pageHeaders: {
    albums: {
      num: '01',
      kicker: 'Catalogue · Albums',
      title: 'Every record in the crate',
      subtitle:
        'Every release in the collection, filterable by genre, year, and title. Sort by when it landed, by sleeve, or by artist.',
    },
    artists: {
      num: '02',
      kicker: 'Catalogue · Artists',
      title: 'Every act on the shelf',
      subtitle:
        'Everyone represented in the collection. Sort alphabetically, by depth, or by who arrived most recently.',
    },
    search: {
      num: '00',
      kicker: 'Catalogue · Search',
      title: 'Search the catalogue',
      resultsTitlePrefix: 'Results for',
      emptySubtitle:
        'Use the nav search bar (or press / from any page) to find albums, artists, and genres across the collection.',
      resultsSubtitle:
        'Full matches across the collection. Tap a row to open the record or artist.',
    },
    stats: {
      num: '00',
      kicker: 'Stats · russ.fm / collection dossier',
      title: 'The shelf by the numbers',
    },
    genres: {
      num: '03',
      kicker: 'Catalogue · Genres',
      title: 'Genre constellations',
      subtitle:
        'A living map of the collection: genres anchor the field, artists orbit by how often they appear on the shelf.',
    },
    wrapped: {
      num: '07',
      kicker: 'Wrapped · russ.fm / year dossier',
      yearToDateSuffix: ' · year to date',
    },
  },

  /** Horizontal drag-scroll walls and catalogue strips on the home page. */
  walls: {
    recentAlbumsCount: 24,
    recentArtistsCount: 18,
    randomPicksCount: 4,
  },

  /** Tile grid column counts at each responsive breakpoint. */
  tiles: {
    albumGridCols: { base: 2, sm: 3, md: 4, lg: 5, xl: 6 },
    artistGridCols: { base: 2, sm: 3, md: 4, lg: 5, xl: 6 },
    showHoverMeta: true,
  },

  /** Section sizing on the Stats page. */
  stats: {
    topArtistsCount: 8,
    topYearsCount: 5,
    recentAdditionsCount: 10,
    fromTheCratesCount: 10,
    randomArtistsCount: 8,
    decadeBarsMaxDecades: 8,
  },

  /** Random page "next up if you shuffle" peek strip. */
  random: {
    peekCount: 8,
  },

  /**
   * Cover-colour tinting defaults. These are the locked-in public values;
   * the dev-only TweaksPanel can override at runtime via localStorage.
   */
  tintDefaults: {
    intensity: 0.85,
    showCoverColor: true,
  },

  /** Information density. */
  density: {
    default: 'medium' as Density,
  },

  /** Mono-case catalogue labels (CAT. A01 · INDUSTRIAL RECORDS · IR0008). */
  monoLabels: {
    default: true,
  },

  /** Default theme. Existing ThemeProvider still owns light/dark/system. */
  theme: {
    default: 'system' as ThemeDefault,
  },
} as const;

export type RedesignConfig = typeof redesignConfig;
