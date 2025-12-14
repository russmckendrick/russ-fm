import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { NeutralBackground } from '../shared/FullBleedBackground';
import { RevealText } from '../shared/RevealText';
import { AnimatedCounter } from '../shared/AnimatedCounter';
import type { WrappedData } from '@/types/wrapped';

interface DecadesSectionProps {
  decades: WrappedData['insights']['decades'];
  totalReleases: number;
}

// Decade-specific styling
const decadeStyles: Record<string, { color: string; emoji: string }> = {
  '1950s': { color: '#78716c', emoji: '' },
  '1960s': { color: '#f59e0b', emoji: '' },
  '1970s': { color: '#f97316', emoji: '' },
  '1980s': { color: '#ec4899', emoji: '' },
  '1990s': { color: '#8b5cf6', emoji: '' },
  '2000s': { color: '#3b82f6', emoji: '' },
  '2010s': { color: '#06b6d4', emoji: '' },
  '2020s': { color: '#22c55e', emoji: '' },
};

const getDecadeStyle = (decade: string) => {
  return decadeStyles[decade] || { color: '#6b7280', emoji: '' };
};

export function DecadesSection({
  decades,
  totalReleases,
}: DecadesSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  // Sort decades by name
  const sortedDecades = [...decades].sort((a, b) => a.name.localeCompare(b.name));

  // Find the dominant decade
  const dominantDecade = decades.reduce((prev, current) =>
    current.count > prev.count ? current : prev
  , decades[0]);

  return (
    <div ref={ref} className="relative h-full w-full flex items-center justify-center overflow-hidden">
      <NeutralBackground variant="dark" accentColor={getDecadeStyle(dominantDecade?.name || '').color} />

      <div className="relative z-10 w-full max-w-4xl mx-auto px-4">
        {/* Section title */}
        <RevealText delay={0.1} className="text-center mb-10 md:mb-14">
          <h2 className="text-white/60 text-sm md:text-base uppercase tracking-[0.2em] mb-2">
            Through the Decades
          </h2>
          <p className="text-white text-2xl md:text-3xl font-semibold">
            Music Across Time
          </p>
        </RevealText>

        {/* Decades timeline */}
        <div className="relative">
          {/* Center line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 transform -translate-x-1/2 hidden md:block" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {sortedDecades.map((decade, index) => {
              const style = getDecadeStyle(decade.name);
              const percentage = (decade.count / totalReleases) * 100;
              const isDominant = decade.name === dominantDecade?.name;

              return (
                <motion.div
                  key={`decade-card-${index}`}
                  className={`
                    relative p-4 md:p-6 rounded-xl backdrop-blur-sm
                    ${isDominant ? 'bg-white/15 border border-white/20' : 'bg-white/5'}
                    transition-colors hover:bg-white/10
                  `}
                  initial={{ opacity: 0, y: 30 }}
                  animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                  transition={{
                    duration: 0.6,
                    delay: 0.2 + index * 0.1,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  {/* Dominant badge */}
                  {isDominant && (
                    <motion.div
                      className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: style.color }}
                      initial={{ scale: 0 }}
                      animate={isInView ? { scale: 1 } : { scale: 0 }}
                      transition={{ delay: 0.8, type: 'spring' }}
                    >
                      <span className="text-white">Top</span>
                    </motion.div>
                  )}

                  {/* Decade name */}
                  <div
                    className="text-2xl md:text-3xl font-bold mb-2"
                    style={{ color: style.color }}
                  >
                    {decade.name.replace('s', "'s")}
                  </div>

                  {/* Count */}
                  <div className="text-white text-3xl md:text-4xl font-bold">
                    <AnimatedCounter
                      value={decade.count}
                      duration={1500}
                      delay={400 + index * 100}
                      triggerOnView={false}
                    />
                  </div>

                  {/* Percentage */}
                  <div className="text-white/50 text-sm mt-1">
                    {percentage.toFixed(0)}% of collection
                  </div>

                  {/* Visual bar */}
                  <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: style.color }}
                      initial={{ width: 0 }}
                      animate={isInView ? { width: `${percentage}%` } : { width: 0 }}
                      transition={{
                        duration: 1,
                        delay: 0.6 + index * 0.1,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Era insight */}
        {dominantDecade && (
          <motion.p
            className="mt-10 text-center text-white/50 text-sm"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
          >
            My collection leans heavily into the{' '}
            <span className="text-white font-medium" style={{ color: getDecadeStyle(dominantDecade.name).color }}>
              {dominantDecade.name}
            </span>
          </motion.p>
        )}
      </div>
    </div>
  );
}
