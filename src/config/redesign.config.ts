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

export const redesignConfig = {
  hero: {
    variant: 'split' as HeroVariant,
  },

  /** Horizontal drag-scroll walls and catalogue strips on the home page. */
  walls: {
    recentAlbumsCount: 24,
    recentArtistsCount: 18,
    catalogueStripCount: 8,
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
