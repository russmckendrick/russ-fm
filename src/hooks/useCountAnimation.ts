import { useEffect, useState } from 'react';

/**
 * Hook to animate counting from 0 to a target number
 * @param target - The target number to count to
 * @param duration - Animation duration in milliseconds (default: 2000)
 * @param enabled - Whether the animation should run (default: true)
 * @returns The current animated value
 */
export function useCountAnimation(
  target: number,
  duration: number = 2000,
  enabled: boolean = true
): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(target);
      return;
    }

    let startTime: number | null = null;
    let animationFrame: number;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth deceleration
      const easeOutQuad = (t: number) => t * (2 - t);
      const easedProgress = easeOutQuad(progress);

      setCount(Math.floor(easedProgress * target));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [target, duration, enabled]);

  return count;
}
