import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { FullBleedBackground } from '../shared/FullBleedBackground';
import { NumberReveal } from '../shared/RevealText';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { ScrollHint } from '../presentation/NavigationControls';

interface IntroSectionProps {
  year: number;
  isYearToDate: boolean;
  colors: AlbumColorPalette | null;
  totalReleases: number;
  backgroundVariant?: 'default' | 'vibrant' | 'subtle' | 'deep';
}

export function IntroSection({
  year,
  isYearToDate,
  colors,
  totalReleases,
  backgroundVariant = 'default',
}: IntroSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <div ref={ref} className="relative h-full w-full flex items-center justify-center">
      <FullBleedBackground colors={colors} overlay="gradient" variant={backgroundVariant} />

      <div className="relative z-10 text-center px-4">
        {/* Pre-title */}
        <motion.p
          className="text-white/60 text-sm md:text-base uppercase tracking-[0.3em] mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          My Year in Music
        </motion.p>

        {/* Year number - dramatic reveal */}
        <NumberReveal delay={0.4} className="mb-6">
          <h1 className="text-[8rem] md:text-[12rem] lg:text-[16rem] font-bold leading-none tracking-tighter text-white">
            {year}
          </h1>
        </NumberReveal>

        {/* Year to date indicator */}
        {isYearToDate && (
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white/80 text-sm">Year to Date</span>
          </motion.div>
        )}

        {/* Subtle preview stat */}
        <motion.p
          className="mt-8 text-white/50 text-lg md:text-xl"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.6, delay: 1 }}
        >
          {totalReleases} albums collected
        </motion.p>
      </div>

      {/* Scroll hint */}
      <ScrollHint />

      {/* Decorative elements */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
      />
    </div>
  );
}
