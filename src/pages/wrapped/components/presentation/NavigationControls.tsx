import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Play, Pause } from 'lucide-react';

interface NavigationControlsProps {
  canGoNext: boolean;
  canGoPrev: boolean;
  isAutoAdvancing: boolean;
  progress?: number; // 0-1 for timing indicator
  onNext: () => void;
  onPrev: () => void;
  onToggleAutoAdvance: () => void;
  className?: string;
}

export function NavigationControls({
  canGoNext,
  canGoPrev,
  isAutoAdvancing,
  progress = 0,
  onNext,
  onPrev,
  onToggleAutoAdvance,
  className = '',
}: NavigationControlsProps) {
  return (
    <div
      className={`
        fixed z-50 right-6 top-1/2 -translate-y-1/2
        flex flex-col gap-2
        max-md:right-4 max-md:bottom-8 max-md:top-auto max-md:translate-y-0
        max-md:flex-row max-md:right-auto max-md:left-4
        ${className}
      `}
    >
      {/* Previous */}
      <motion.button
        onClick={onPrev}
        disabled={!canGoPrev}
        className={`
          w-10 h-10 rounded-full
          flex items-center justify-center
          backdrop-blur-md
          transition-all duration-200
          ${canGoPrev
            ? 'bg-white/10 hover:bg-white/20 text-white cursor-pointer'
            : 'bg-white/5 text-white/30 cursor-not-allowed'
          }
        `}
        whileHover={canGoPrev ? { scale: 1.1 } : {}}
        whileTap={canGoPrev ? { scale: 0.95 } : {}}
        aria-label="Previous section"
      >
        <ChevronUp className="w-5 h-5" />
      </motion.button>

      {/* Auto-advance toggle with progress ring */}
      <div className="relative">
        {/* Progress ring - always show background when auto-advancing */}
        {isAutoAdvancing && (
          <svg
            className="absolute -inset-1 w-12 h-12 -rotate-90 pointer-events-none"
            viewBox="0 0 48 48"
          >
            {/* Background circle */}
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="3"
            />
            {/* Progress circle */}
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 20}
              strokeDashoffset={2 * Math.PI * 20 * (1 - progress)}
              style={{
                transition: 'stroke-dashoffset 0.1s linear',
              }}
            />
          </svg>
        )}
        <motion.button
          onClick={onToggleAutoAdvance}
          className={`
            relative w-10 h-10 rounded-full
            flex items-center justify-center
            backdrop-blur-md
            transition-all duration-200
            ${isAutoAdvancing
              ? 'bg-white/30 text-white'
              : 'bg-white/10 hover:bg-white/20 text-white'
            }
          `}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          animate={isAutoAdvancing ? { scale: [1, 1.05, 1] } : {}}
          transition={isAutoAdvancing ? { repeat: Infinity, duration: 2 } : {}}
          aria-label={isAutoAdvancing ? 'Pause auto-advance' : 'Start auto-advance'}
        >
          {isAutoAdvancing ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </motion.button>
      </div>

      {/* Next */}
      <motion.button
        onClick={onNext}
        disabled={!canGoNext}
        className={`
          w-10 h-10 rounded-full
          flex items-center justify-center
          backdrop-blur-md
          transition-all duration-200
          ${canGoNext
            ? 'bg-white/10 hover:bg-white/20 text-white cursor-pointer'
            : 'bg-white/5 text-white/30 cursor-not-allowed'
          }
        `}
        whileHover={canGoNext ? { scale: 1.1 } : {}}
        whileTap={canGoNext ? { scale: 0.95 } : {}}
        aria-label="Next section"
      >
        <ChevronDown className="w-5 h-5" />
      </motion.button>
    </div>
  );
}

// Scroll hint for first section
export function ScrollHint({ className = '' }: { className?: string }) {
  return (
    <motion.div
      className={`
        absolute bottom-8 left-1/2 -translate-x-1/2
        flex flex-col items-center gap-2
        text-white/60
        ${className}
      `}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2, duration: 0.6 }}
    >
      <span className="text-xs uppercase tracking-widest">Scroll</span>
      <motion.div
        animate={{ y: [0, 6, 0] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
      >
        <ChevronDown className="w-5 h-5" />
      </motion.div>
    </motion.div>
  );
}
