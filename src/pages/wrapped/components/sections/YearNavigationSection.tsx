import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { NeutralBackground } from '../shared/FullBleedBackground';
import { RevealText } from '../shared/RevealText';

interface YearNavigationSectionProps {
  currentYear: number;
  previousYear?: number;
  nextYear?: number;
  availableYears: number[];
}

export function YearNavigationSection({
  currentYear,
  previousYear,
  nextYear,
  availableYears,
}: YearNavigationSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  return (
    <div ref={ref} className="relative h-full w-full flex items-center justify-center overflow-hidden">
      <NeutralBackground variant="darker" />

      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 text-center">
        {/* Section title */}
        <RevealText delay={0.1} className="mb-12">
          <h2 className="text-white/60 text-sm md:text-base uppercase tracking-[0.2em] mb-4">
            Explore More
          </h2>
          <p className="text-white text-3xl md:text-4xl font-bold">
            My Collection Journey
          </p>
        </RevealText>

        {/* Previous/Next Year Navigation */}
        <motion.div
          className="flex items-center justify-center gap-6 mb-12"
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
        >
          {/* Previous Year */}
          {previousYear ? (
            <motion.div variants={itemVariants}>
              <Link
                to={`/wrapped/${previousYear}`}
                className="group flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
              >
                <ChevronLeft className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
                <div className="text-left">
                  <p className="text-white/50 text-xs uppercase tracking-wider">Previous</p>
                  <p className="text-white text-2xl font-bold">{previousYear}</p>
                </div>
              </Link>
            </motion.div>
          ) : (
            <div className="w-40" /> // Spacer
          )}

          {/* Current Year Badge */}
          <motion.div
            variants={itemVariants}
            className="px-6 py-4 rounded-2xl bg-white/10 border border-white/20"
          >
            <p className="text-white/50 text-xs uppercase tracking-wider">Viewing</p>
            <p className="text-white text-3xl font-bold">{currentYear}</p>
          </motion.div>

          {/* Next Year */}
          {nextYear ? (
            <motion.div variants={itemVariants}>
              <Link
                to={`/wrapped/${nextYear}`}
                className="group flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
              >
                <div className="text-right">
                  <p className="text-white/50 text-xs uppercase tracking-wider">Next</p>
                  <p className="text-white text-2xl font-bold">{nextYear}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
              </Link>
            </motion.div>
          ) : (
            <div className="w-40" /> // Spacer
          )}
        </motion.div>

        {/* All Years Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center justify-center gap-2 mb-6">
            <Calendar className="w-4 h-4 text-white/40" />
            <p className="text-white/40 text-sm">All Years</p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {availableYears.map((year, idx) => (
              <motion.div
                key={year}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ delay: 0.7 + idx * 0.05 }}
              >
                <Link
                  to={`/wrapped/${year}`}
                  className={`
                    block px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${year === currentYear
                      ? 'bg-white text-black'
                      : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 hover:border-white/20'
                    }
                  `}
                >
                  {year}
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Home link */}
        <motion.div
          className="mt-12"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 1 }}
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/60 hover:text-white text-sm transition-all"
          >
            Back to Collection
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
