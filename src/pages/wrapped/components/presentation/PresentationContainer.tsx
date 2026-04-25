import { ReactNode, forwardRef } from 'react';
import { motion } from 'framer-motion';

interface PresentationContainerProps {
  children: ReactNode;
  onScroll?: () => void;
  className?: string;
}

export const PresentationContainer = forwardRef<HTMLDivElement, PresentationContainerProps>(
  ({ children, onScroll, className = '' }, ref) => {
    return (
      <div
        ref={ref}
        onScroll={onScroll}
        className={`
          min-h-[100dvh] w-full overflow-y-auto overflow-x-hidden
          snap-y snap-mandatory
          scroll-smooth
          ${className}
        `}
        style={{
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
    );
  }
);

PresentationContainer.displayName = 'PresentationContainer';

interface PresentationSectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function PresentationSection({ children, className = '', id }: PresentationSectionProps) {
  return (
    <section
      id={id}
      className={`
        min-h-[100dvh] w-full
        snap-start snap-always
        relative overflow-hidden
        flex items-center justify-center
        ${className}
      `}
    >
      {children}
    </section>
  );
}

// Wrapper for section content with entrance animation
interface AnimatedSectionContentProps {
  children: ReactNode;
  isVisible?: boolean;
  delay?: number;
  className?: string;
}

export function AnimatedSectionContent({
  children,
  isVisible = true,
  delay = 0,
  className = '',
}: AnimatedSectionContentProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{
        duration: 0.8,
        delay,
        ease: [0.16, 1, 0.3, 1], // Custom easing for smooth feel
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
