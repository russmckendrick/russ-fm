import { useState, useEffect, useRef } from 'react';
import { WrappedData, GridItem, WrappedRelease, WrappedArtist, StatCardData } from '@/types/wrapped';
import { generateDynamicGrid, getGridClasses, getAnimationType } from '../utils/dynamicGrid';
import { IndividualReleaseCard } from './cards/IndividualReleaseCard';
import { IndividualArtistCard } from './cards/IndividualArtistCard';
import { DynamicStatCard } from './cards/DynamicStatCard';
import { AnimatedCard } from './AnimatedCard';

interface DynamicBentoGridProps {
  data: WrappedData;
}

export function DynamicBentoGrid({ data }: DynamicBentoGridProps) {
  const gridItems = generateDynamicGrid(data);
  const [rowHeight, setRowHeight] = useState(120);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gridRef.current) return;

    const updateRowHeight = () => {
      if (!gridRef.current) return;

      // Get current grid width
      const gridWidth = gridRef.current.offsetWidth;

      // Determine columns based on breakpoints (matching CSS)
      let columns = 6;
      if (window.innerWidth <= 640) columns = 2;
      else if (window.innerWidth <= 1024) columns = 4;

      // Calculate gap (1rem = 16px)
      const gap = 16; // 1rem
      const totalGap = (columns - 1) * gap;

      // Calculate column width
      const colWidth = (gridWidth - totalGap) / columns;

      // Set row height to match column width for square cells
      setRowHeight(colWidth);
    };

    // Initial calculation
    updateRowHeight();

    // Observe resizes
    const observer = new ResizeObserver(updateRowHeight);
    observer.observe(gridRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={gridRef}
      className="dynamic-bento-grid gap-4 mb-8"
      style={{ gridAutoRows: `${rowHeight}px` }}
    >
      {gridItems.map((item, index) => (
        <AnimatedCard
          key={item.id}
          delay={item.animationDelay}
          animation={getAnimationType(index) as 'scaleUp' | 'slideUp' | 'slideLeft' | 'slideRight' | 'fadeIn'}
          className={getGridClasses(item)}
        >
          <GridItemRenderer item={item} />
        </AnimatedCard>
      ))}
    </div>
  );
}

interface GridItemRendererProps {
  item: GridItem;
}

// Adapter functions to convert wrapped data to card-expected formats
function adaptWrappedReleaseToCard(wrappedRelease: WrappedRelease) {
  return {
    slug: wrappedRelease.slug,
    title: wrappedRelease.release_name,
    artist_name: wrappedRelease.release_artist,
    images: wrappedRelease.images,
    date_added: wrappedRelease.date_added
  };
}

function adaptWrappedArtistToCard(wrappedArtist: WrappedArtist) {
  return {
    name: wrappedArtist.name,
    slug: wrappedArtist.slug,
    count: wrappedArtist.count,
    images: wrappedArtist.images,
    topAlbum: wrappedArtist.topAlbum
  };
}

function GridItemRenderer({ item }: GridItemRendererProps) {
  switch (item.type) {
    case 'release':
      return (
        <IndividualReleaseCard
          release={adaptWrappedReleaseToCard(item.data as WrappedRelease)}
          size={item.size}
          imageSize={item.imageSize}
        />
      );

    case 'artist':
      return (
        <IndividualArtistCard
          artist={adaptWrappedArtistToCard(item.data as WrappedArtist)}
          size={item.size}
          imageSize={item.imageSize}
        />
      );

    case 'stat':
      return (
        <DynamicStatCard
          stat={item.data as StatCardData}
          size={item.size}
        />
      );

    default:
      return null;
  }
}