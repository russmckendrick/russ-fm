import { useState, useCallback, useEffect, useRef } from 'react';

export interface WrappedNavigationState {
  currentSection: number;
  totalSections: number;
  isAutoAdvancing: boolean;
  isPaused: boolean;
  progress: number; // 0-1 for timer visualization
}

export interface UseWrappedNavigationOptions {
  totalSections: number;
  autoAdvanceDelay?: number; // ms per section, default 6000
  initialSection?: number;
  onSectionChange?: (section: number) => void;
}

export function useWrappedNavigation({
  totalSections,
  autoAdvanceDelay = 6000,
  initialSection = 0,
  onSectionChange,
}: UseWrappedNavigationOptions) {
  const [currentSection, setCurrentSection] = useState(initialSection);
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const timerRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Use refs to avoid stale closures in timers and prevent infinite loops
  const currentSectionRef = useRef(currentSection);
  const totalSectionsRef = useRef(totalSections);
  const onSectionChangeRef = useRef(onSectionChange);

  // Keep refs in sync
  useEffect(() => {
    currentSectionRef.current = currentSection;
  }, [currentSection]);

  useEffect(() => {
    totalSectionsRef.current = totalSections;
  }, [totalSections]);

  useEffect(() => {
    onSectionChangeRef.current = onSectionChange;
  }, [onSectionChange]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const goToSection = useCallback((index: number, smooth = true) => {
    if (index < 0 || index >= totalSectionsRef.current) return;

    setCurrentSection(index);
    setProgress(0);
    onSectionChangeRef.current?.(index);

    // Scroll to section
    if (containerRef.current) {
      const sectionHeight = containerRef.current.clientHeight;
      containerRef.current.scrollTo({
        top: index * sectionHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  const nextSection = useCallback(() => {
    const current = currentSectionRef.current;
    const total = totalSectionsRef.current;
    if (current < total - 1) {
      goToSection(current + 1);
    }
  }, [goToSection]);

  const prevSection = useCallback(() => {
    const current = currentSectionRef.current;
    if (current > 0) {
      goToSection(current - 1);
    }
  }, [goToSection]);

  const toggleAutoAdvance = useCallback(() => {
    setIsAutoAdvancing(prev => !prev);
    setProgress(0);
  }, []);

  const pauseAutoAdvance = useCallback(() => {
    setIsPaused(true);
    clearTimers();
  }, [clearTimers]);

  const resumeAutoAdvance = useCallback(() => {
    setIsPaused(false);
  }, []);

  // Auto-advance logic
  useEffect(() => {
    if (!isAutoAdvancing || isPaused) {
      clearTimers();
      setProgress(0);
      return;
    }

    // Don't auto-advance on the last section
    if (currentSection >= totalSections - 1) {
      setIsAutoAdvancing(false);
      setProgress(0);
      return;
    }

    const startTime = Date.now();

    // Update progress bar
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min(elapsed / autoAdvanceDelay, 1);
      setProgress(newProgress);
    }, 50);

    // Advance to next section
    timerRef.current = window.setTimeout(() => {
      // Use ref to get current value at time of execution
      const current = currentSectionRef.current;
      const total = totalSectionsRef.current;

      if (current < total - 1) {
        goToSection(current + 1);
      } else {
        setIsAutoAdvancing(false);
      }
    }, autoAdvanceDelay);

    return () => clearTimers();
  }, [isAutoAdvancing, isPaused, currentSection, totalSections, autoAdvanceDelay, goToSection, clearTimers]);

  // Handle scroll-based section detection
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, clientHeight } = containerRef.current;
    const newSection = Math.round(scrollTop / clientHeight);

    if (newSection !== currentSectionRef.current && newSection >= 0 && newSection < totalSectionsRef.current) {
      setCurrentSection(newSection);
      setProgress(0);
      onSectionChangeRef.current?.(newSection);
    }
  }, []);

  // Keyboard navigation - only up/down for section navigation
  // Left/right is reserved for in-section pagination (e.g., album pages)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        nextSection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        prevSection();
      } else if (e.key === 'Escape') {
        setIsAutoAdvancing(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSection, prevSection]);

  return {
    // State
    currentSection,
    totalSections,
    isAutoAdvancing,
    isPaused,
    progress,
    canGoNext: currentSection < totalSections - 1,
    canGoPrev: currentSection > 0,

    // Actions
    goToSection,
    nextSection,
    prevSection,
    toggleAutoAdvance,
    pauseAutoAdvance,
    resumeAutoAdvance,

    // Refs
    containerRef,
    handleScroll,
  };
}
