import { GridItem, GridSize, GridItemType, ImageSize, GridSpan, StatCardData, WrappedData, WrappedRelease, WrappedArtist } from '@/types/wrapped';

// Seeded random number generator for consistent results per year
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

// Size weights for weighted random selection (releases only get small/medium)
const SIZE_WEIGHTS = {
  small: 70,   // 70% - Most common (1x1)
  medium: 30,  // 30% - Medium frequency (2x2) 
};

// Get grid span for a size (includes wide and extra-wide options)
function getSquareSpan(size: GridSize): GridSpan {
  if (size === 'wide') {
    return { cols: 2, rows: 1 }; // 2x1 for wide cards
  }
  if (size === 'extra-wide') {
    return { cols: 4, rows: 2 }; // 4x2 for timeline cards
  }
  const spans = { small: 1, medium: 2, large: 3 };
  const span = spans[size as 'small' | 'medium' | 'large'];
  return { cols: span, rows: span };
}

// Get optimal image size based on card size and type
function getOptimalImageSize(size: GridSize, type: GridItemType): ImageSize {
  if (type === 'artist') {
    const artistImageSizes: Record<GridSize, ImageSize> = {
      small: 'avatar',
      medium: 'medium',
      large: 'hi-res',
      wide: 'medium',
      'extra-wide': 'medium',
    };
    return artistImageSizes[size];
  } else {
    const releaseImageSizes: Record<GridSize, ImageSize> = {
      small: 'medium',   // Medium for 1x1 release cards
      medium: 'medium',  // Medium for 2x2 release cards
      large: 'hi-res',   // Hi-res for 3x3 release cards
      wide: 'medium',
      'extra-wide': 'medium',
    };
    return releaseImageSizes[size];
  }
}

// Weighted random size selection with artist release count consideration
function getWeightedRandomSize(rng: SeededRandom, type: GridItemType, index: number, data?: WrappedRelease | WrappedArtist | StatCardData): GridSize {
  // Hero content strategy: first 3 releases get guaranteed medium
  if (type === 'release' && index < 3) {
    return rng.next() < 0.7 ? 'medium' : 'small';
  }

  // Stat cards sizing based on type
  if (type === 'stat' && data) {
    const statType = (data as StatCardData).type;
    // Timeline gets extra-wide (6x3) layout for better visualization
    if (statType === 'timeline') {
      return 'extra-wide';
    }
    // Individual genre cards get small (1x1) layout
    if (statType === 'genre') {
      return 'small';
    }
    // All other stats get small (1x1) layout
    return 'small';
  }

  // Artist size based on release count
  if (type === 'artist' && data) {
    const releaseCount = (data as WrappedArtist).count || 0;
    
    // Artists with 10+ releases get large size
    if (releaseCount >= 10) {
      return rng.next() < 0.8 ? 'large' : 'medium';
    }
    // Artists with 5+ releases get medium size  
    else if (releaseCount >= 5) {
      return rng.next() < 0.7 ? 'medium' : 'large';
    }
    // Artists with 3+ releases get medium/small
    else if (releaseCount >= 3) {
      return rng.next() < 0.6 ? 'medium' : 'small';
    }
    // Artists with 1-2 releases get small/medium
    else {
      return rng.next() < 0.8 ? 'small' : 'medium';
    }
  }

  // Default weighted random selection for releases (only small/medium)
  const totalWeight = SIZE_WEIGHTS.small + SIZE_WEIGHTS.medium;
  const random = rng.next() * totalWeight;

  if (random < SIZE_WEIGHTS.small) return 'small';
  return 'medium';
}

// Create stat cards data
function createStatCards(data: WrappedData): StatCardData[] {
  const baseStats: StatCardData[] = [
    {
      type: 'total',
      title: 'Total Releases',
      value: data.summary.totalReleases,
    },
    {
      type: 'peak',
      title: 'Peak Month',
      value: data.summary.peakMonth,
      data: data.insights.timeline.find(t => t.month === data.summary.peakMonth)?.releases || []
    },
    {
      type: 'average',
      title: 'Per Month',
      value: data.summary.avgPerMonth,
    },
    {
      type: 'unique',
      title: 'Unique Artists',
      value: data.summary.uniqueArtists,
    },
    {
      type: 'first',
      title: 'First Addition',
      value: data.summary.firstAddition,
      data: data.releases[0]?.release
    },
    {
      type: 'last',
      title: 'Last Addition', 
      value: data.summary.lastAddition,
      data: data.releases[data.releases.length - 1]?.release
    },
    {
      type: 'decades',
      title: 'Release Decades',
      value: data.insights.decades.length,
      data: data.insights.decades
    },
    {
      type: 'timeline',
      title: 'Monthly Timeline',
      value: 'Timeline',
      data: data.insights.timeline
    }
  ];

  // Add individual genre cards (top 6 genres)
  const genreCards: StatCardData[] = data.insights.genres.slice(0, 6).map(genre => ({
    type: 'genre' as const,
    title: genre.name,
    value: genre.count,
    data: [{ name: genre.name, count: genre.count }]
  }));

  return [...baseStats, ...genreCards];
}

// Shuffle and mix content types with artist ordering
function shuffleAndMix(
  releases: WrappedRelease[],
  artists: WrappedArtist[],
  statCards: StatCardData[],
  rng: SeededRandom
): Array<{ type: GridItemType; data: WrappedRelease | WrappedArtist | StatCardData; originalIndex?: number }> {
  const content: Array<{ type: GridItemType; data: WrappedRelease | WrappedArtist | StatCardData; originalIndex?: number }> = [];

  // Add all releases (shuffled)
  releases.forEach((release, index) => {
    content.push({ type: 'release', data: release, originalIndex: index });
  });

  // Sort artists by release count (descending) for proper prominence
  const sortedArtists = [...artists].sort((a, b) => (b.count || 0) - (a.count || 0));
  
  // Add top artists first (they'll get better positioning)
  sortedArtists.slice(0, Math.ceil(sortedArtists.length * 0.3)).forEach(artist => {
    content.push({ type: 'artist', data: artist });
  });

  // Shuffle releases with top artists for better distribution
  const topContent = rng.shuffle(content);

  // Add remaining artists
  sortedArtists.slice(Math.ceil(sortedArtists.length * 0.3)).forEach(artist => {
    topContent.push({ type: 'artist', data: artist });
  });

  // Final shuffle but keep top artists near the beginning
  const shuffledContent = rng.shuffle(topContent);

  // Separate timeline, genre cards, and other stat cards
  const timelineCard = statCards.find(card => card.type === 'timeline');
  const genreCards = statCards.filter(card => card.type === 'genre');
  const otherStatCards = statCards.filter(card => card.type !== 'timeline' && card.type !== 'genre');
  
  // Shuffle genres to distribute them randomly
  const shuffledGenres = rng.shuffle(genreCards);
  
  // Create insertion points for stat cards - spread throughout the grid
  const totalContentLength = shuffledContent.length;
  const totalStatsToInsert = otherStatCards.length + shuffledGenres.length + (timelineCard ? 1 : 0);
  const spacing = Math.floor(totalContentLength / (totalStatsToInsert + 1));
  
  const result: Array<{ type: GridItemType; data: WrappedRelease | WrappedArtist | StatCardData; originalIndex?: number }> = [];
  let genreIndex = 0;
  let otherStatIndex = 0;
  let timelineInserted = false;
  
  shuffledContent.forEach((item, index) => {
    result.push(item);
    
    // Insert timeline card early (position 3-5)
    if (!timelineInserted && index >= 2 && index <= 4 && timelineCard) {
      result.push({ type: 'stat', data: timelineCard });
      timelineInserted = true;
    }
    
    // Distribute other cards throughout the grid
    if (index > 0 && index % spacing === 0) {
      // Randomly choose between genre and other stat cards
      if (rng.next() < 0.6 && genreIndex < shuffledGenres.length) {
        // 60% chance to insert a genre card if available
        result.push({ type: 'stat', data: shuffledGenres[genreIndex] });
        genreIndex++;
      } else if (otherStatIndex < otherStatCards.length) {
        // Insert other stat card
        result.push({ type: 'stat', data: otherStatCards[otherStatIndex] });
        otherStatIndex++;
      } else if (genreIndex < shuffledGenres.length) {
        // If no other stats left, insert remaining genres
        result.push({ type: 'stat', data: shuffledGenres[genreIndex] });
        genreIndex++;
      }
    }
  });
  
  // Add any remaining cards at the end
  while (genreIndex < shuffledGenres.length) {
    result.push({ type: 'stat', data: shuffledGenres[genreIndex] });
    genreIndex++;
  }
  while (otherStatIndex < otherStatCards.length) {
    result.push({ type: 'stat', data: otherStatCards[otherStatIndex] });
    otherStatIndex++;
  }
  if (!timelineInserted && timelineCard) {
    result.push({ type: 'stat', data: timelineCard });
  }

  return result;
}

// Generate dynamic grid layout
export function generateDynamicGrid(data: WrappedData): GridItem[] {
  const rng = new SeededRandom(data.year);
  
  // Use ALL releases and artists, not just top ones
  const allReleases = data.releases.map(r => r.release);
  const allArtists = data.insights.artists;
  const statCards = createStatCards(data);

  // Shuffle and mix content
  const mixedContent = shuffleAndMix(allReleases, allArtists, statCards, rng);

  // Generate grid items with sizes and optimizations
  const gridItems: GridItem[] = mixedContent.map((item, index) => {
    const size = getWeightedRandomSize(rng, item.type, item.originalIndex || index, item.data);
    const gridSpan = getSquareSpan(size);
    const imageSize = getOptimalImageSize(size, item.type);
    
    return {
      id: `${item.type}-${index}`,
      type: item.type,
      data: item.data,
      size,
      gridSpan,
      imageSize,
      animationDelay: Math.min(index * 20, 300) // Reduced stagger, max 300ms
    };
  });

  return gridItems;
}

// CSS class utilities for grid items
export function getGridClasses(item: GridItem): string {
  const { cols, rows } = item.gridSpan;
  const classes = `col-span-${cols} row-span-${rows}`;
  
  // Debug: Log timeline cards
  if (item.type === 'stat' && (item.data as StatCardData).type === 'timeline') {
    console.log('TIMELINE CARD:', { cols, rows, classes, size: item.size });
  }
  
  return classes;
}

// Animation utilities
export function getAnimationType(index: number): string {
  const animations = ['scaleUp', 'slideUp', 'slideLeft', 'slideRight', 'fadeIn'];
  return animations[index % animations.length];
}