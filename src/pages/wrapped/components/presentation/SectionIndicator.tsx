import { motion } from 'framer-motion';

interface SectionIndicatorProps {
  totalSections: number;
  currentSection: number;
  progress?: number; // 0-1 for auto-advance progress
  onSectionClick: (index: number) => void;
  className?: string;
}

export function SectionIndicator({
  totalSections,
  currentSection,
  progress = 0,
  onSectionClick,
  className = '',
}: SectionIndicatorProps) {
  return (
    <nav
      className={`
        fixed z-50
        flex flex-col gap-3
        left-6 top-1/2 -translate-y-1/2
        max-md:left-1/2 max-md:-translate-x-1/2 max-md:top-auto max-md:bottom-8 max-md:translate-y-0
        max-md:flex-row
        ${className}
      `}
      aria-label="Section navigation"
    >
      {Array.from({ length: totalSections }).map((_, index) => {
        const isActive = index === currentSection;
        const isPast = index < currentSection;

        return (
          <button
            key={index}
            onClick={() => onSectionClick(index)}
            className={`
              relative group
              transition-all duration-300
              focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black
              rounded-full
            `}
            aria-label={`Go to section ${index + 1}`}
            aria-current={isActive ? 'step' : undefined}
          >
            {/* Background dot */}
            <div
              className={`
                w-2.5 h-2.5 rounded-full
                transition-all duration-300
                ${isActive
                  ? 'bg-white scale-100'
                  : isPast
                    ? 'bg-white/60 scale-75'
                    : 'bg-white/30 scale-75 group-hover:bg-white/50 group-hover:scale-90'
                }
              `}
            />

            {/* Progress ring for active section during auto-advance */}
            {isActive && progress > 0 && (
              <svg
                className="absolute -inset-1 w-[18px] h-[18px] -rotate-90"
                viewBox="0 0 18 18"
              >
                <circle
                  cx="9"
                  cy="9"
                  r="7"
                  fill="none"
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="2"
                />
                <motion.circle
                  cx="9"
                  cy="9"
                  r="7"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: progress }}
                  transition={{ duration: 0.05 }}
                  style={{
                    strokeDasharray: '1 1',
                  }}
                />
              </svg>
            )}

            {/* Expanded active indicator */}
            {isActive && (
              <motion.div
                layoutId="activeIndicator"
                className="absolute -inset-1 border-2 border-white/40 rounded-full"
                initial={false}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
