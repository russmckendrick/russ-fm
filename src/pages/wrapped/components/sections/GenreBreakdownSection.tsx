import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { NeutralBackground } from '../shared/FullBleedBackground';
import { RevealText } from '../shared/RevealText';
import { AnimatedCounter } from '../shared/AnimatedCounter';
import type { WrappedData } from '@/types/wrapped';

interface GenreBreakdownSectionProps {
  genres: WrappedData['insights']['genres'];
  totalReleases: number;
}

// Genre-specific colors
const genreColors: Record<string, string> = {
  'Rock': '#ef4444',
  'Electronic': '#3b82f6',
  'Jazz': '#f59e0b',
  'Hip Hop': '#8b5cf6',
  'Pop': '#ec4899',
  'Classical': '#6366f1',
  'Folk, World, & Country': '#22c55e',
  'Funk / Soul': '#f97316',
  'Blues': '#06b6d4',
  'Reggae': '#84cc16',
  'Latin': '#eab308',
  'Stage & Screen': '#a855f7',
  'Non-Music': '#64748b',
  'Children\'s': '#fb923c',
  'Brass & Military': '#78716c',
};

const getGenreColor = (genre: string): string => {
  return genreColors[genre] || '#6b7280';
};

export function GenreBreakdownSection({
  genres,
  totalReleases,
}: GenreBreakdownSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  // Take top 6 genres
  const topGenres = genres.slice(0, 6);
  const maxCount = topGenres[0]?.count || 1;

  return (
    <div ref={ref} className="relative h-full w-full flex items-center justify-center overflow-hidden">
      <NeutralBackground variant="dark" />

      <div className="relative z-10 w-full max-w-4xl mx-auto px-4">
        {/* Section title */}
        <RevealText delay={0.1} className="text-center mb-10 md:mb-14">
          <h2 className="text-white/60 text-sm md:text-base uppercase tracking-[0.2em] mb-2">
            Genre Breakdown
          </h2>
          <p className="text-white text-2xl md:text-3xl font-semibold">
            What I Collected
          </p>
        </RevealText>

        {/* Genre bars */}
        <div className="space-y-6">
          {topGenres.map((genre, index) => {
            const percentage = (genre.count / maxCount) * 100;
            const color = getGenreColor(genre.name);

            return (
              <motion.div
                key={`genre-bar-${index}`}
                initial={{ opacity: 0, x: -30 }}
                animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
                transition={{
                  duration: 0.6,
                  delay: 0.2 + index * 0.1,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <Link
                  to={`/genres/${encodeURIComponent(genre.name)}`}
                  className="group block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium group-hover:text-white/80 transition-colors">
                      {genre.name}
                    </span>
                    <span className="text-white/60 text-sm">
                      <AnimatedCounter
                        value={genre.count}
                        duration={1500}
                        delay={300 + index * 100}
                        triggerOnView={false}
                      />
                      <span className="ml-1">albums</span>
                      <span className="ml-2 text-white/40">
                        ({genre.percentage.toFixed(0)}%)
                      </span>
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ backgroundColor: color }}
                      initial={{ width: 0 }}
                      animate={isInView ? { width: `${percentage}%` } : { width: 0 }}
                      transition={{
                        duration: 1.2,
                        delay: 0.4 + index * 0.1,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    />

                    {/* Shine effect */}
                    <motion.div
                      className="absolute inset-y-0 left-0 w-full"
                      style={{
                        background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)`,
                      }}
                      initial={{ x: '-100%' }}
                      animate={isInView ? { x: '100%' } : { x: '-100%' }}
                      transition={{
                        duration: 1,
                        delay: 1 + index * 0.1,
                        ease: 'easeInOut',
                      }}
                    />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Other genres count */}
        {genres.length > 6 && (
          <motion.p
            className="mt-8 text-center text-white/40 text-sm"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
          >
            + {genres.length - 6} more genres
          </motion.p>
        )}
      </div>
    </div>
  );
}
