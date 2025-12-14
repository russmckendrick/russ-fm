import { motion, useInView } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NeutralBackground } from '../shared/FullBleedBackground';
import { RevealText } from '../shared/RevealText';
import type { WrappedRelease } from '@/types/wrapped';
import { getImageUrl, handleImageError } from '@/lib/image-utils';

interface TopAlbumsPerMonthSectionProps {
  month: string;
  releases: WrappedRelease[];
  monthNumber: number;
  totalMonths: number;
  accentColor?: string;
}

const ALBUMS_PER_PAGE = 12;

export function TopAlbumsPerMonthSection({
  month,
  releases,
  monthNumber,
  totalMonths,
  accentColor = '#3b82f6',
}: TopAlbumsPerMonthSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, amount: 0.5 }); // Track when section is actively visible
  const hasAnimated = useRef(false);
  const [currentPage, setCurrentPage] = useState(0);

  // Track if animations have played
  if (isInView && !hasAnimated.current) {
    hasAnimated.current = true;
  }

  // Calculate pagination
  const totalPages = Math.ceil(releases.length / ALBUMS_PER_PAGE);
  const startIndex = currentPage * ALBUMS_PER_PAGE;
  const currentAlbums = releases.slice(startIndex, startIndex + ALBUMS_PER_PAGE);

  const canGoPrev = currentPage > 0;
  const canGoNext = currentPage < totalPages - 1;

  const goToPrev = () => {
    if (canGoPrev) setCurrentPage(prev => prev - 1);
  };

  const goToNext = () => {
    if (canGoNext) setCurrentPage(prev => prev + 1);
  };

  // Keyboard navigation for album pagination (left/right arrows)
  useEffect(() => {
    if (!isInView || totalPages <= 1) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (canGoPrev) setCurrentPage(prev => prev - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (canGoNext) setCurrentPage(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInView, totalPages, canGoPrev, canGoNext]);

  return (
    <div ref={ref} className="relative h-full w-full flex items-center justify-center overflow-hidden">
      <NeutralBackground variant="dark" accentColor={accentColor} />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4">
        {/* Section title */}
        <RevealText delay={0.1} className="text-center mb-6">
          <h2 className="text-white/60 text-sm md:text-base uppercase tracking-[0.2em] mb-2">
            Albums by Month ({monthNumber}/{totalMonths})
          </h2>
        </RevealText>

        {/* Month header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={hasAnimated.current ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          className="text-center mb-8"
        >
          <p className="text-white text-2xl md:text-3xl font-bold">
            {month}
          </p>
          <p className="text-white/50 text-sm">
            {releases.length} {releases.length === 1 ? 'album' : 'albums'}
          </p>
        </motion.div>

        {/* Albums grid with pagination controls */}
        <div className="flex items-center gap-4">
          {/* Left arrow - only show if more than one page */}
          {totalPages > 1 && (
            <motion.button
              onClick={goToPrev}
              disabled={!canGoPrev}
              className={`
                flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                transition-all duration-200
                ${canGoPrev
                  ? 'bg-white/10 hover:bg-white/20 text-white cursor-pointer'
                  : 'bg-white/5 text-white/30 cursor-not-allowed'
                }
              `}
              whileHover={canGoPrev ? { scale: 1.1 } : {}}
              whileTap={canGoPrev ? { scale: 0.95 } : {}}
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>
          )}

          {/* Albums grid */}
          <motion.div
            key={currentPage}
            className="flex-1 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
          >
            {currentAlbums.map((release, idx) => (
              <motion.div
                key={`album-grid-${idx}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={hasAnimated.current ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{
                  duration: 0.4,
                  delay: 0.1 + idx * 0.05,
                }}
              >
                <Link
                  to={`/album/${release.slug}`}
                  className="group block"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-white/5">
                    <img
                      src={getImageUrl((release.images.medium || release.images['hi-res']).replace(/^\//, ''))}
                      alt={release.release_name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      onError={handleImageError}
                    />

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-white text-xs font-medium truncate">
                          {release.release_name}
                        </p>
                        <p className="text-white/60 text-[10px] truncate">
                          {release.release_artist}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>

          {/* Right arrow - only show if more than one page */}
          {totalPages > 1 && (
            <motion.button
              onClick={goToNext}
              disabled={!canGoNext}
              className={`
                flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                transition-all duration-200
                ${canGoNext
                  ? 'bg-white/10 hover:bg-white/20 text-white cursor-pointer'
                  : 'bg-white/5 text-white/30 cursor-not-allowed'
                }
              `}
              whileHover={canGoNext ? { scale: 1.1 } : {}}
              whileTap={canGoNext ? { scale: 0.95 } : {}}
            >
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          )}
        </div>

        {/* Page indicator - only show if more than one page */}
        {totalPages > 1 && (
          <motion.div
            className="mt-6 flex items-center justify-center gap-2"
            initial={{ opacity: 0 }}
            animate={hasAnimated.current ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 0.5 }}
          >
            <span className="text-white/60 text-sm">
              {startIndex + 1}-{Math.min(startIndex + ALBUMS_PER_PAGE, releases.length)} of {releases.length}
            </span>
            <div className="flex gap-1.5 ml-4">
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentPage(idx)}
                  className={`
                    h-1.5 rounded-full transition-all duration-300
                    ${idx === currentPage
                      ? 'w-6 bg-white'
                      : 'w-1.5 bg-white/30 hover:bg-white/50'
                    }
                  `}
                  aria-label={`Go to page ${idx + 1}`}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
