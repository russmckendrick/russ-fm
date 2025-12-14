import { motion, useInView, Variants } from 'framer-motion';
import { useRef, ReactNode } from 'react';

interface RevealTextProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
}

// Simple fade-up reveal
export function RevealText({
  children,
  delay = 0,
  duration = 0.6,
  className = '',
  as: Component = 'div',
}: RevealTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  const MotionComponent = motion[Component as keyof typeof motion] as typeof motion.div;

  return (
    <MotionComponent
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{
        duration,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </MotionComponent>
  );
}

// Character-by-character reveal for dramatic titles
interface CharacterRevealProps {
  text: string;
  delay?: number;
  stagger?: number;
  className?: string;
  charClassName?: string;
}

export function CharacterReveal({
  text,
  delay = 0,
  stagger = 0.03,
  className = '',
  charClassName = '',
}: CharacterRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  };

  const charVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 50,
      rotateX: -90,
    },
    visible: {
      opacity: 1,
      y: 0,
      rotateX: 0,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  return (
    <motion.div
      ref={ref}
      className={`overflow-hidden ${className}`}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      aria-label={text}
    >
      {text.split('').map((char, index) => (
        <motion.span
          key={index}
          className={`inline-block ${charClassName}`}
          variants={charVariants}
          style={{ transformOrigin: 'bottom' }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </motion.div>
  );
}

// Word-by-word reveal
interface WordRevealProps {
  text: string;
  delay?: number;
  stagger?: number;
  className?: string;
  wordClassName?: string;
}

export function WordReveal({
  text,
  delay = 0,
  stagger = 0.1,
  className = '',
  wordClassName = '',
}: WordRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  };

  const wordVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 20,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  const words = text.split(' ');

  return (
    <motion.div
      ref={ref}
      className={`flex flex-wrap ${className}`}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
    >
      {words.map((word, index) => (
        <motion.span
          key={index}
          className={`inline-block mr-[0.25em] ${wordClassName}`}
          variants={wordVariants}
        >
          {word}
        </motion.span>
      ))}
    </motion.div>
  );
}

// Scale-up number reveal for big stats
interface NumberRevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function NumberReveal({
  children,
  delay = 0,
  className = '',
}: NumberRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, scale: 0.5, filter: 'blur(20px)' }}
      animate={isInView
        ? { opacity: 1, scale: 1, filter: 'blur(0px)' }
        : { opacity: 0, scale: 0.5, filter: 'blur(20px)' }
      }
      transition={{
        duration: 0.8,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
