import type { WrappedStory } from '@/types/wrappedStory';

/**
 * A year file, public/wrapped/wrapped-YYYY.json (and wrapped-ytd.json), written by
 * scripts/generate-wrapped-data.ts: the headline numbers and the `story` block that
 * both /wrapped views draw from.
 */
export interface WrappedData {
  year: number;
  isYearToDate: boolean;
  summary: {
    totalReleases: number;
    uniqueArtists: number;
    topGenre: string;
    topStyle: string;
    avgPerMonth: number;
    peakMonth: string;
    firstAddition: string;
    lastAddition: string;
    projectedTotal?: number;
  };
  /** Per-record detail for the story chapters and the presentation (scripts/lib/wrapped-story.ts) */
  story?: WrappedStory;
}
