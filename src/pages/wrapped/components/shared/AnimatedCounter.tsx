import { useEffect, useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  triggerOnView?: boolean;
}

export function AnimatedCounter({
  value,
  duration = 2000,
  delay = 0,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
  triggerOnView = true,
}: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  useEffect(() => {
    if (triggerOnView && !isInView) return;
    if (hasStarted) return;

    const timeoutId = setTimeout(() => {
      setHasStarted(true);
      let startTime: number | null = null;
      let animationFrame: number;

      const animate = (currentTime: number) => {
        if (!startTime) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function for smooth deceleration
        const easeOutQuad = (t: number) => t * (2 - t);
        const easedProgress = easeOutQuad(progress);

        if (decimals > 0) {
          setCount(Number((easedProgress * value).toFixed(decimals)));
        } else {
          setCount(Math.floor(easedProgress * value));
        }

        if (progress < 1) {
          animationFrame = requestAnimationFrame(animate);
        } else {
          setCount(value);
        }
      };

      animationFrame = requestAnimationFrame(animate);

      return () => {
        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
        }
      };
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [value, duration, delay, decimals, isInView, triggerOnView, hasStarted]);

  const formattedCount = decimals > 0
    ? count.toFixed(decimals)
    : count.toLocaleString();

  return (
    <motion.span
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.6, delay: delay / 1000 }}
    >
      {prefix}{formattedCount}{suffix}
    </motion.span>
  );
}

// Larger stat display with label
interface StatCounterProps {
  value: number;
  label: string;
  sublabel?: string;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function StatCounter({
  value,
  label,
  sublabel,
  duration = 2000,
  delay = 0,
  prefix = '',
  suffix = '',
  className = '',
}: StatCounterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <motion.div
      ref={ref}
      className={`text-center ${className}`}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6, delay: delay / 1000 }}
    >
      <div className="text-5xl md:text-7xl font-bold tracking-tight text-white">
        <AnimatedCounter
          value={value}
          duration={duration}
          delay={delay}
          prefix={prefix}
          suffix={suffix}
          triggerOnView={false}
        />
      </div>
      <div className="mt-2 text-lg md:text-xl font-medium text-white/80">
        {label}
      </div>
      {sublabel && (
        <div className="mt-1 text-sm text-white/50">
          {sublabel}
        </div>
      )}
    </motion.div>
  );
}
