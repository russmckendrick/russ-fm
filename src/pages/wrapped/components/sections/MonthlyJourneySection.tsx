import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { NeutralBackground } from '../shared/FullBleedBackground';
import { RevealText } from '../shared/RevealText';
import type { WrappedData } from '@/types/wrapped';
import { getImageUrl, handleImageError } from '@/lib/image-utils';

interface MonthlyJourneySectionProps {
  timeline: WrappedData['insights']['timeline'];
  peakMonth: string;
  accentColor?: string;
}

export function MonthlyJourneySection({
  timeline,
  peakMonth,
  accentColor = '#3b82f6',
}: MonthlyJourneySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const maxCount = Math.max(...timeline.map(t => t.count), 1);

  // Get month abbreviation - month is already a name like "January"
  const getMonthAbbrev = (monthName: string) => {
    return monthName.slice(0, 3);
  };

  // Find peak month data
  const peakMonthData = timeline.find(t => t.month === peakMonth);

  // Calculate how many album covers to show per bar (max 8 visible)
  const getVisibleCovers = (count: number) => Math.min(count, 8);

  return (
    <div ref={ref} className="relative h-full w-full flex items-center justify-center overflow-hidden">
      <NeutralBackground variant="dark" accentColor={accentColor} />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4">
        {/* Section title */}
        <RevealText delay={0.1} className="text-center mb-8 md:mb-10">
          <h2 className="text-white/60 text-sm md:text-base uppercase tracking-[0.2em] mb-2">
            Month by Month
          </h2>
          <p className="text-white text-2xl md:text-3xl font-semibold">
            My Journey Through the Year
          </p>
        </RevealText>

        {/* Album cover bar chart */}
        <div className="flex items-end justify-center gap-2 md:gap-4 mb-6 px-4">
          {timeline.map((month, index) => {
            const isPeak = month.month === peakMonth;
            const isHovered = hoveredMonth === month.month;
            const visibleCovers = getVisibleCovers(month.count);
            // Calculate height in pixels - max height 400px on desktop, 300px on mobile
            const maxHeight = 400;
            const barHeightPx = month.count > 0 ? Math.max((month.count / maxCount) * maxHeight, 40) : 8;

            return (
              <motion.div
                key={`timeline-month-${index}`}
                className="relative flex flex-col items-center"
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.2 + index * 0.03,
                }}
                onMouseEnter={() => setHoveredMonth(month.month)}
                onMouseLeave={() => setHoveredMonth(null)}
              >
                {/* Count label */}
                <motion.span
                  className={`
                    mb-2 text-sm font-bold transition-opacity duration-200
                    ${isPeak ? 'text-white' : 'text-white/70'}
                  `}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isHovered || isPeak ? 1 : 0 }}
                >
                  {month.count}
                </motion.span>

                {/* Peak indicator */}
                {isPeak && (
                  <motion.div
                    className="mb-2 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider text-white"
                    style={{ backgroundColor: accentColor }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                    transition={{ delay: 1.2 }}
                  >
                    Peak
                  </motion.div>
                )}

                {/* Album cover stack bar */}
                <motion.div
                  className={`
                    relative w-12 md:w-16 overflow-hidden cursor-pointer
                    rounded-lg
                    ${isHovered ? 'ring-2 ring-white/40' : ''}
                  `}
                  initial={{ height: 0 }}
                  animate={{ height: isInView ? barHeightPx : 0 }}
                  transition={{
                    duration: 0.8,
                    delay: 0.3 + index * 0.05,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{
                    boxShadow: isHovered && month.count > 0 ? `0 0 30px ${accentColor}50` : 'none',
                  }}
                >
                  {month.count === 0 ? (
                    // Empty month indicator
                    <div className="w-full h-full bg-white/10 rounded-lg" />
                  ) : (
                    // Album covers stacked
                    <div className="absolute inset-0 flex flex-col">
                      {month.releases.slice(0, visibleCovers).map((release, idx) => (
                        <div
                          key={`journey-cover-${index}-${idx}`}
                          className="relative w-full flex-1 min-h-0"
                        >
                          <img
                            src={getImageUrl((release.images.medium || release.images['hi-res']).replace(/^\//, ''))}
                            alt={release.release_name}
                            className="w-full h-full object-cover"
                            onError={handleImageError}
                            title={`${release.release_name} - ${release.release_artist}`}
                          />
                          {/* Subtle separator line */}
                          {idx < visibleCovers - 1 && (
                            <div className="absolute bottom-0 left-0 right-0 h-px bg-black/40" />
                          )}
                        </div>
                      ))}

                      {/* Overflow indicator */}
                      {month.count > visibleCovers && (
                        <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-center">
                          <span className="text-xs text-white font-semibold">
                            +{month.count - visibleCovers}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>

                {/* Month label */}
                <span className={`
                  mt-3 text-xs font-medium
                  ${isPeak ? 'text-white' : 'text-white/50'}
                `}>
                  {getMonthAbbrev(month.month)}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Peak month summary */}
        {peakMonthData && peakMonthData.count > 0 && (
          <motion.div
            className="mt-6 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 1.4 }}
          >
            <p className="text-white/60 text-sm">
              <span className="text-white font-medium">{peakMonth}</span> was my biggest month with{' '}
              <span className="text-white font-medium">{peakMonthData.count}</span> albums
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
