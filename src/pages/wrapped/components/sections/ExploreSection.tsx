import { motion, useInView, AnimatePresence } from 'framer-motion';
import { useRef, useState } from 'react';
import { ChevronDown, Grid3X3 } from 'lucide-react';
import { NeutralBackground } from '../shared/FullBleedBackground';
import { RevealText } from '../shared/RevealText';
import { DynamicBentoGrid } from '../DynamicBentoGrid';
import type { WrappedData } from '@/types/wrapped';
import { getImageUrl } from '@/lib/image-utils';

interface ExploreSectionProps {
  data: WrappedData;
}

export function ExploreSection({ data }: ExploreSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      ref={ref}
      className={`
        relative w-full transition-all duration-500
        ${isExpanded ? 'min-h-screen h-auto' : 'h-screen'}
      `}
    >
      <NeutralBackground variant="darker" />

      <div className="relative z-10 w-full h-full">
        {/* Collapsed state - summary view */}
        {!isExpanded && (
          <div className="h-full flex flex-col items-center justify-center px-4">
            {/* Section title */}
            <RevealText delay={0.1} className="text-center mb-8">
              <h2 className="text-white/60 text-sm md:text-base uppercase tracking-[0.2em] mb-2">
                That's My Year
              </h2>
              <p className="text-white text-3xl md:text-4xl font-bold">
                {data.summary.totalReleases} Albums
              </p>
              <p className="text-white/60 text-lg mt-2">
                from {data.summary.uniqueArtists} artists
              </p>
            </RevealText>

            {/* Quick stats recap */}
            <motion.div
              className="flex flex-wrap justify-center gap-4 md:gap-8 mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ delay: 0.3 }}
            >
              <div className="text-center">
                <p className="text-white/40 text-xs uppercase tracking-wider">Top Genre</p>
                <p className="text-white font-medium">{data.summary.topGenre}</p>
              </div>
              <div className="hidden md:block w-px h-10 bg-white/20" />
              <div className="text-center">
                <p className="text-white/40 text-xs uppercase tracking-wider">Peak Month</p>
                <p className="text-white font-medium">{data.summary.peakMonth}</p>
              </div>
              <div className="hidden md:block w-px h-10 bg-white/20" />
              <div className="text-center">
                <p className="text-white/40 text-xs uppercase tracking-wider">Avg/Month</p>
                <p className="text-white font-medium">{data.summary.avgPerMonth.toFixed(1)}</p>
              </div>
            </motion.div>

            {/* Expand button */}
            <motion.button
              onClick={() => setIsExpanded(true)}
              className="group flex items-center gap-3 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 transition-all"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Grid3X3 className="w-5 h-5 text-white/70" />
              <span className="text-white font-medium">Explore All Albums</span>
              <ChevronDown className="w-5 h-5 text-white/50 group-hover:translate-y-0.5 transition-transform" />
            </motion.button>

            {/* Album art preview */}
            <motion.div
              className="mt-12 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: 0.7 }}
            >
              <div className="flex -space-x-3">
                {data.releases.slice(0, 5).map((item, idx) => (
                  <motion.img
                    key={`explore-preview-${idx}`}
                    src={getImageUrl((item.release.images.medium || item.release.images['hi-res']).replace(/^\//, ''))}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover border-2 border-black"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + idx * 0.1 }}
                  />
                ))}
                {data.releases.length > 5 && (
                  <motion.div
                    className="w-16 h-16 rounded-lg bg-white/10 border-2 border-black flex items-center justify-center"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.3 }}
                  >
                    <span className="text-white/60 text-xs font-medium">
                      +{data.releases.length - 5}
                    </span>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* Expanded state - full bento grid */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pt-8 pb-16"
            >
              {/* Collapse button */}
              <div className="sticky top-4 z-50 flex justify-center mb-8">
                <motion.button
                  onClick={() => setIsExpanded(false)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/80 hover:bg-black backdrop-blur-md border border-white/20 transition-all"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <ChevronDown className="w-4 h-4 text-white/70 rotate-180" />
                  <span className="text-white text-sm font-medium">Collapse</span>
                </motion.button>
              </div>

              {/* Header */}
              <div className="text-center mb-8 px-4">
                <h2 className="text-white text-2xl md:text-3xl font-bold">
                  All {data.summary.totalReleases} Albums
                </h2>
                <p className="text-white/50 mt-2">
                  My complete {data.year} collection
                </p>
              </div>

              {/* Bento Grid */}
              <div className="container mx-auto px-4">
                <DynamicBentoGrid data={data} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
