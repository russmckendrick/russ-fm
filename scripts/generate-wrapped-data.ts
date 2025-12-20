import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color palette interface (matches src/types/wrapped.ts)
interface ColorPalette {
  background: string;
  foreground: string;
  accent: string;
  muted: string;
}

// Default fallback palette
const defaultPalette: ColorPalette = {
  background: '#1a1a1a',
  foreground: '#ffffff',
  accent: '#666666',
  muted: '#404040'
};

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
  artists: Array<{
    name: string;
    uri_artist: string;
    json_detailed_artist: string;
    images_uri_artist: {
      'hi-res': string;
      medium: string;
      avatar: string;
    };
    biography?: string;
  }>;
  genre_names: string[];
  uri_release: string;
  uri_artist: string;
  date_added: string;
  date_release_year: string;
  json_detailed_release: string;
  json_detailed_artist: string;
  images_uri_release: {
    'hi-res': string;
    medium: string;
    avatar?: string;
  };
  images_uri_artist: {
    'hi-res': string;
    medium: string;
    avatar: string;
  };
}

// Lightweight release for wrapped data
interface Release {
  release_name: string;
  release_artist: string;
  date_added: string;
  date_release_year: string;
  genre_names: string[];
  slug: string;
  images: {
    'hi-res': string;
    medium: string;
    avatar?: string;
  };
  artists: Array<{
    name: string;
    slug: string;
    images: {
      'hi-res'?: string;
      medium?: string;
      avatar?: string;
    };
  }>;
  colors?: ColorPalette;
}

interface AlbumDetail {
  slug: string;
  styles: string[];
  formats: Array<{ name: string; qty: string; descriptions?: string[] }>;
}


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
  releases: Array<{
    release: Release;
    albumDetail?: AlbumDetail;
  }>;
  insights: {
    genres: Array<{ name: string; count: number; percentage: number }>;
    artists: Array<{ name: string; slug: string; count: number; images?: { 'hi-res'?: string; medium?: string; avatar?: string } }>;
    decades: Array<{ name: string; count: number }>;
    timeline: Array<{ month: string; count: number; releases: Release[]; dominantColor?: ColorPalette }>;
    topAlbums: Array<{
      slug: string;
      title: string;
      artist_name: string;
      images: { 'hi-res': string; medium: string; avatar?: string };
      date_added: string;
    }>;
    topArtists: Array<{
      name: string;
      slug: string;
      count: number;
      images?: { 'hi-res'?: string; medium?: string; avatar?: string };
      topAlbum?: {
        slug: string;
        title: string;
        images: { 'hi-res': string; medium: string; avatar?: string };
      };
    }>;
  };
  theme?: {
    primary: ColorPalette;
    secondary: ColorPalette;
    monthlyPalettes: ColorPalette[];
  };
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

async function loadAlbumDetail(slug: string): Promise<AlbumDetail | undefined> {
  try {
    const albumPath = path.join(__dirname, '..', 'public', 'album', slug, `${slug}.json`);
    if (fs.existsSync(albumPath)) {
      const data = JSON.parse(fs.readFileSync(albumPath, 'utf-8'));
      // Only return the fields we need
      return {
        slug: data.slug,
        styles: data.styles || [],
        formats: data.formats || []
      };
    }
  } catch (error) {
    console.error(`Error loading album ${slug}:`, error);
  }
  return undefined;
}

async function generateWrappedData(year: number, isYearToDate: boolean = false): Promise<WrappedData> {
  // Load main collection
  const collectionPath = path.join(__dirname, '..', 'public', 'collection.json');
  const originalCollection: OriginalRelease[] = JSON.parse(fs.readFileSync(collectionPath, 'utf-8'));

  // Filter releases by year
  const yearReleases = originalCollection.filter(release => {
    const releaseYear = new Date(release.date_added).getFullYear();
    return releaseYear === year;
  });

  // Sort releases by date added
  yearReleases.sort((a, b) =>
    new Date(a.date_added).getTime() - new Date(b.date_added).getTime()
  );

  // Create lightweight enriched releases (only store what we need)
  const enrichedReleases = await Promise.all(
    yearReleases.map(async (release) => {
      const albumSlug = getSlugFromUri(release.uri_release);
      const albumDetail = await loadAlbumDetail(albumSlug);

      // Create a lightweight release object with ALL image sizes
      const releaseColors = getAlbumColors(albumSlug);
      const lightRelease: Release = {
        release_name: release.release_name,
        release_artist: release.release_artist,
        date_added: release.date_added,
        date_release_year: release.date_release_year,
        genre_names: release.genre_names,
        slug: albumSlug,
        images: {
          'hi-res': release.images_uri_release['hi-res'],
          medium: release.images_uri_release.medium,
          avatar: release.images_uri_release['hi-res'].replace('-hi-res.jpg', '-avatar.jpg') // Generate avatar path
        },
        // Include ALL artist image sizes
        artists: release.artists.map(artist => ({
          name: artist.name,
          slug: getSlugFromUri(artist.uri_artist),
          images: {
            'hi-res': artist.images_uri_artist?.['hi-res'],
            medium: artist.images_uri_artist?.medium,
            avatar: artist.images_uri_artist?.avatar
          }
        })),
        // Add pre-computed colors from album-colors.json
        colors: releaseColors
      };

      return {
        release: lightRelease,
        albumDetail,
      };
    })
  );

  // Calculate insights
  const genreCounts = new Map<string, number>();
  const artistCounts = new Map<string, { count: number; images?: { 'hi-res'?: string; medium?: string; avatar?: string }; slug: string }>();
  const decadeCounts = new Map<string, number>();
  const monthlyData = new Map<string, Release[]>();
  const styleCounts = new Map<string, number>();

  // Process enriched data for insights
  for (const { release, albumDetail } of enrichedReleases) {
    // Genres
    release.genre_names?.forEach(genre => {
      genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
    });

    // Styles from album detail
    if (albumDetail?.styles) {
      albumDetail.styles.forEach(style => {
        styleCounts.set(style, (styleCounts.get(style) || 0) + 1);
      });
    }

    // Artists
    if (release.artists && release.artists.length > 0) {
      for (const artist of release.artists) {
        if (artist.name !== 'Various' && artist.name !== 'Various Artists') {
          const current = artistCounts.get(artist.name) || { count: 0, slug: artist.slug };
          artistCounts.set(artist.name, {
            count: current.count + 1,
            slug: artist.slug,
            images: {
              'hi-res': artist.images['hi-res'],
              medium: artist.images.medium,
              avatar: artist.images.avatar
            }
          });
        }
      }
    }

    // Release decades
    if (release.date_release_year) {
      const year = parseInt(release.date_release_year);
      if (!isNaN(year)) {
        const decade = `${Math.floor(year / 10) * 10}s`;
        decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
      }
    }

    // Timeline
    const date = new Date(release.date_added);
    const monthKey = getMonthName(date.getMonth());
    const monthReleases = monthlyData.get(monthKey) || [];
    monthReleases.push(release);
    monthlyData.set(monthKey, monthReleases);
  }

  // Convert to arrays and sort
  const genres = [...genreCounts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / yearReleases.length) * 100)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const artists = [...artistCounts.entries()]
    .map(([name, data]) => ({
      name,
      slug: data.slug,
      count: data.count,
      images: data.images
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const decades = [...decadeCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      // Sort decades chronologically (newest first)
      const aDecade = parseInt(a.name.replace('s', ''));
      const bDecade = parseInt(b.name.replace('s', ''));
      return bDecade - aDecade;
    });

  const timeline = Array.from({ length: 12 }, (_, i) => {
    const monthName = getMonthName(i);
    const releases = monthlyData.get(monthName) || [];
    // Get dominant color from first release of the month (if any have colors)
    const dominantColor = releases.length > 0
      ? (releases.find(r => r.colors)?.colors || undefined)
      : undefined;
    return {
      month: monthName,
      count: releases.length,
      releases,
      dominantColor
    };
  });

  // Get top albums (6 for the 3x2 grid) from the lightweight releases
  const topAlbums = enrichedReleases
    .slice(0, 6)
    .map(({ release }) => ({
      slug: release.slug,
      title: release.release_name,
      artist_name: release.release_artist,
      images: release.images,
      date_added: release.date_added
    }));

  // Get top artists with their top albums (4 for the 2x2 grid)
  const topArtists = artists.slice(0, 4).map((artist) => {
    // Find the artist's most recent album from this year
    const artistAlbum = enrichedReleases.find(({ release }) =>
      release.artists?.some(a => a.slug === artist.slug)
    );

    if (artistAlbum) {
      return {
        name: artist.name,
        slug: artist.slug,
        count: artist.count,
        images: artist.images,
        topAlbum: {
          slug: artistAlbum.release.slug,
          title: artistAlbum.release.release_name,
          images: artistAlbum.release.images
        }
      };
    }

    return {
      name: artist.name,
      slug: artist.slug,
      count: artist.count,
      images: artist.images
    };
  });

  const summary = calculateStats(yearReleases);

  // Update top style
  const topStyle = [...styleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
  summary.topStyle = topStyle;

  // Add projected total for year to date
  if (isYearToDate) {
    const currentDate = new Date();
    const daysInYear = 365;
    const daysPassed = Math.floor((currentDate.getTime() - new Date(year, 0, 1).getTime()) / (1000 * 60 * 60 * 24));
    const projectionRate = daysInYear / daysPassed;
    summary.projectedTotal = Math.round(yearReleases.length * projectionRate);
  }

  // Build theme object with colors from key albums
  const firstRelease = enrichedReleases[0]?.release;
  const lastRelease = enrichedReleases[enrichedReleases.length - 1]?.release;

  const theme = {
    primary: firstRelease?.colors || defaultPalette,
    secondary: lastRelease?.colors || defaultPalette,
    monthlyPalettes: timeline.map(month => month.dominantColor || defaultPalette)
  };

  return {
    year,
    isYearToDate,
    summary,
    releases: enrichedReleases,
    insights: {
      genres,
      artists,
      decades,
      timeline,
      topAlbums,
      topArtists
    },
    theme
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

      fs.writeFileSync(filePath, JSON.stringify(wrappedData, null, 2));
      console.log(`✓ Generated ${fileName}`);
    }

    // Also generate the current year as a standard year file if it's not YTD
    if (years.has(currentYear)) {
      const standardYearData = await generateWrappedData(currentYear, false);
      const standardPath = path.join(wrappedDir, `wrapped-${currentYear}.json`);
      fs.writeFileSync(standardPath, JSON.stringify(standardYearData, null, 2));
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