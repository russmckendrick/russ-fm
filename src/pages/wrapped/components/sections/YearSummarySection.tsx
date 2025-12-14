import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { NeutralBackground } from '../shared/FullBleedBackground';
import { StatCounter } from '../shared/AnimatedCounter';
import { RevealText } from '../shared/RevealText';
import type { WrappedData } from '@/types/wrapped';

interface YearSummarySectionProps {
  summary: WrappedData['summary'];
  year: number;
  accentColor?: string;
}

export function YearSummarySection({
  summary,
  year,
  accentColor,
}: YearSummarySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const stats = [
    {
      value: summary.totalReleases,
      label: 'Albums',
      sublabel: 'added to collection',
    },
    {
      value: summary.uniqueArtists,
      label: 'Artists',
      sublabel: 'discovered',
    },
    {
      value: summary.avgPerMonth,
      label: 'Per Month',
      sublabel: 'on average',
      decimals: 1,
    },
  ];

  return (
    <div ref={ref} className="relative h-full w-full flex items-center justify-center">
      <NeutralBackground variant="dark" accentColor={accentColor} />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
        {/* Section title */}
        <RevealText
          delay={0.1}
          className="text-center mb-12 md:mb-16"
        >
          <h2 className="text-white/60 text-sm md:text-base uppercase tracking-[0.2em]">
            The Numbers
          </h2>
        </RevealText>

        {/* Main stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {stats.map((stat, index) => (
            <StatCounter
              key={`summary-stat-${index}`}
              value={stat.value}
              label={stat.label}
              sublabel={stat.sublabel}
              delay={200 + index * 150}
              duration={2000}
            />
          ))}
        </div>

        {/* Additional insights */}
        <motion.div
          className="mt-16 md:mt-20 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, delay: 1 }}
        >
          {/* Peak month */}
          <div className="text-center">
            <p className="text-white/50 text-sm uppercase tracking-wider mb-1">Peak Month</p>
            <p className="text-white text-xl md:text-2xl font-semibold">{summary.peakMonth}</p>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px h-12 bg-white/20" />

          {/* Top genre */}
          <div className="text-center">
            <p className="text-white/50 text-sm uppercase tracking-wider mb-1">Top Genre</p>
            <p className="text-white text-xl md:text-2xl font-semibold">{summary.topGenre}</p>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px h-12 bg-white/20" />

          {/* Top style */}
          {summary.topStyle && (
            <div className="text-center">
              <p className="text-white/50 text-sm uppercase tracking-wider mb-1">Top Style</p>
              <p className="text-white text-xl md:text-2xl font-semibold">{summary.topStyle}</p>
            </div>
          )}
        </motion.div>

        {/* Projected total for YTD */}
        {summary.projectedTotal && (
          <motion.div
            className="mt-12 text-center"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.6, delay: 1.3 }}
          >
            <p className="text-white/40 text-sm">
              On track for <span className="text-white/70 font-medium">{summary.projectedTotal}</span> albums by year end
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
