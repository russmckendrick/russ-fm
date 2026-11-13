import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStory } from './lib/wrapped-story';
import type { WrappedStory } from '../src/types/wrappedStory';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sleeve palette from album-colors.json (matches AlbumColorPalette in src/hooks/useAlbumColors.ts)
interface ColorPalette {
  v: number;
  flood: string;
  ink: string;
  ground: string;
  glow: string;
  secondary: string | null;
  hue: number;
  vivid: number;
}

// Load album colors once at startup
let albumColors: Record<string, ColorPalette> = {};
try {
  const albumColorsPath = path.join(__dirname, '..', 'public', 'album-colors.json');
  if (fs.existsSync(albumColorsPath)) {
    albumColors = JSON.parse(fs.readFileSync(albumColorsPath, 'utf-8'));
    console.log(`✓ Loaded ${Object.keys(albumColors).length} album color palettes`);
  } else {
    console.warn('⚠ album-colors.json not found, using default colors');
  }
} catch (error) {
  console.error('Error loading album colors:', error);
}

// Helper to get colors for an album slug
function getAlbumColors(slug: string): ColorPalette | undefined {
  const uri = `/album/${slug}/`;
  return albumColors[uri];
}

// Original collection data structure
interface OriginalRelease {
  release_name: string;
  release_artist: string;
  artists: Array<{ name: string; uri_artist: string }>;
  genre_names: string[];
  uri_release: string;
  date_added: string;
  year_original?: number | null;
  /** Present only on boxset members — they never count towards a year's wrapped. */
  boxset?: unknown;
}

/**
 * A year file: the headline numbers and the `story` block. Both /wrapped views draw from
 * `story` alone, so the per-release and insight lists that older pages read are no longer written.
 */
interface WrappedData {
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
  /** Everything /wrapped/:year draws (scripts/lib/wrapped-story.ts) */
  story: WrappedStory;
}

function getMonthName(monthIndex: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[monthIndex];
}

function getSlugFromUri(uri: string): string {
  // Extract slug from uri like "/album/slug/"
  const parts = uri.split('/').filter(p => p);
  return parts[parts.length - 1] || '';
}

function calculateStats(releases: OriginalRelease[]): WrappedData['summary'] {
  if (releases.length === 0) {
    return {
      totalReleases: 0,
      uniqueArtists: 0,
      topGenre: 'None',
      topStyle: 'None',
      avgPerMonth: 0,
      peakMonth: 'None',
      firstAddition: '',
      lastAddition: ''
    };
  }

  // Calculate unique artists
  const artistSet = new Set<string>();
  releases.forEach(release => {
    if (release.artists && release.artists.length > 0) {
      release.artists.forEach(artist => {
        if (artist.name !== 'Various' && artist.name !== 'Various Artists') {
          artistSet.add(artist.name);
        }
      });
    } else if (release.release_artist && release.release_artist !== 'Various' && release.release_artist !== 'Various Artists') {
      artistSet.add(release.release_artist);
    }
  });

  // Calculate genre counts
  const genreCounts = new Map<string, number>();
  releases.forEach(release => {
    release.genre_names?.forEach(genre => {
      genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
    });
  });

  // Calculate monthly distribution
  const monthlyCount = new Map<string, number>();
  releases.forEach(release => {
    const date = new Date(release.date_added);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyCount.set(monthKey, (monthlyCount.get(monthKey) || 0) + 1);
  });

  // Sort releases by date
  const sortedReleases = [...releases].sort((a, b) =>
    new Date(a.date_added).getTime() - new Date(b.date_added).getTime()
  );

  // Find peak month
  let peakMonth = '';
  let maxCount = 0;
  monthlyCount.forEach((count, month) => {
    if (count > maxCount) {
      maxCount = count;
      peakMonth = month;
    }
  });

  const peakDate = new Date(peakMonth + '-01');
  const peakMonthName = getMonthName(peakDate.getMonth());

  // Get top genre
  const topGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

  // Calculate average per month
  const monthCount = monthlyCount.size || 1;
  const avgPerMonth = Math.round((releases.length / monthCount) * 10) / 10;

  return {
    totalReleases: releases.length,
    uniqueArtists: artistSet.size,
    topGenre,
    topStyle: 'None', // Will be calculated from detailed album data
    avgPerMonth,
    peakMonth: peakMonthName,
    firstAddition: sortedReleases[0]?.date_added || '',
    lastAddition: sortedReleases[sortedReleases.length - 1]?.date_added || ''
  };
}

/** The Discogs styles on an album's own JSON, for the year's top style. */
function loadStyles(slug: string): string[] {
  try {
    const albumPath = path.join(__dirname, '..', 'public', 'album', slug, `${slug}.json`);
    if (fs.existsSync(albumPath)) return JSON.parse(fs.readFileSync(albumPath, 'utf-8')).styles || [];
  } catch (error) {
    console.error(`Error loading album ${slug}:`, error);
  }
  return [];
}

async function generateWrappedData(year: number, isYearToDate: boolean = false): Promise<WrappedData> {
  // Load main collection
  const collectionPath = path.join(__dirname, '..', 'public', 'collection.json');
  const originalCollection: OriginalRelease[] = JSON.parse(fs.readFileSync(collectionPath, 'utf-8'));

  // Filter releases by year, excluding boxset members (they'd double-count against their box)
  const yearReleases = originalCollection.filter(release => {
    if (release.boxset != null) return false;
    const releaseYear = new Date(release.date_added).getFullYear();
    return releaseYear === year;
  });

  // Sort releases by date added
  yearReleases.sort((a, b) =>
    new Date(a.date_added).getTime() - new Date(b.date_added).getTime()
  );

  // What the story builder needs from each record
  const styleCounts = new Map<string, number>();
  const storyReleases = yearReleases.map(release => {
    const slug = getSlugFromUri(release.uri_release);
    for (const style of loadStyles(slug)) styleCounts.set(style, (styleCounts.get(style) || 0) + 1);
    return {
      release_name: release.release_name,
      release_artist: release.release_artist,
      date_added: release.date_added,
      year_original: release.year_original ?? null,
      genre_names: release.genre_names,
      slug,
      artists: release.artists.map(artist => ({ name: artist.name, slug: getSlugFromUri(artist.uri_artist) })),
      colors: getAlbumColors(slug),
    };
  });

  const summary = calculateStats(yearReleases);
  summary.topStyle = [...styleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

  // Add projected total for year to date
  if (isYearToDate) {
    const currentDate = new Date();
    const daysInYear = 365;
    const daysPassed = Math.floor((currentDate.getTime() - new Date(year, 0, 1).getTime()) / (1000 * 60 * 60 * 24));
    const projectionRate = daysInYear / daysPassed;
    summary.projectedTotal = Math.round(yearReleases.length * projectionRate);
  }

  return {
    year,
    isYearToDate,
    summary,
    story: buildStory(year, storyReleases, originalCollection),
  };
}

async function main() {
  try {
    // Create wrapped directory if it doesn't exist
    const wrappedDir = path.join(__dirname, '..', 'public', 'wrapped');
    if (!fs.existsSync(wrappedDir)) {
      fs.mkdirSync(wrappedDir, { recursive: true });
    }

    // Load collection to determine available years
    const collectionPath = path.join(__dirname, '..', 'public', 'collection.json');
    const collection: OriginalRelease[] = JSON.parse(fs.readFileSync(collectionPath, 'utf-8'));

    // Get all unique years
    const years = new Set<number>();
    collection.forEach(release => {
      const year = new Date(release.date_added).getFullYear();
      years.add(year);
    });

    const currentYear = new Date().getFullYear();

    // Generate data for each year
    for (const year of Array.from(years).sort()) {
      console.log(`Generating wrapped data for ${year}...`);
      const wrappedData = await generateWrappedData(year, year === currentYear);

      const fileName = year === currentYear ? 'wrapped-ytd.json' : `wrapped-${year}.json`;
      const filePath = path.join(wrappedDir, fileName);

      fs.writeFileSync(filePath, JSON.stringify(wrappedData));
      console.log(`✓ Generated ${fileName}`);
    }

    // Also generate the current year as a standard year file if it's not YTD
    if (years.has(currentYear)) {
      const standardYearData = await generateWrappedData(currentYear, false);
      const standardPath = path.join(wrappedDir, `wrapped-${currentYear}.json`);
      fs.writeFileSync(standardPath, JSON.stringify(standardYearData));
      console.log(`✓ Generated wrapped-${currentYear}.json`);
    }

    console.log('\n✅ All wrapped data generated successfully!');
  } catch (error) {
    console.error('Error generating wrapped data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${__filename}`) {
  main();
}

export { generateWrappedData };