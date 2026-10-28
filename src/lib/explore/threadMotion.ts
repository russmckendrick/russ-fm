/**
 * Motion for The Thread's feed: a slightly under-damped spring for the
 * physical swipe, a linear crossfade for reduced motion, and the rules that
 * turn a drag into "next", "back" or "stay".
 */

export interface SpringResult {
  x: number;
  v: number;
  /** False once it has settled on the target. */
  moving: boolean;
}

/** Stiffness and damping: damping ratio ~0.85, so a swipe lands with the faintest overshoot. */
export const SPRING = { stiffness: 330, damping: 31 } as const;
/** Reduced motion: a straight crossfade over this many seconds per card. */
export const FADE_SECONDS = 0.22;

/**
 * Advance a value `x` with velocity `v` (units per second) towards `target`
 * by `dt` seconds. Two half steps keep it stable when frames are slow.
 */
export function springStep(x: number, v: number, target: number, dt: number, reduced = false): SpringResult {
  if (reduced) {
    const d = target - x;
    const step = dt / FADE_SECONDS;
    if (Math.abs(d) <= step) return { x: target, v: 0, moving: false };
    return { x: x + Math.sign(d) * step, v: 0, moving: true };
  }
  for (let i = 0; i < 2; i++) {
    const h = dt / 2;
    const a = -SPRING.stiffness * (x - target) - SPRING.damping * v;
    v += a * h;
    x += v * h;
  }
  // Within about a pixel and nearly still: land, so the card's video and details don't wait on the last sliver.
  if (Math.abs(x - target) < 0.0015 && Math.abs(v) < 0.04) return { x: target, v: 0, moving: false };
  return { x, v, moving: true };
}

/** A drag past this share of the card, or a flick faster than this (px/ms), moves on. */
export const SWIPE_DISTANCE = { y: 0.16, x: 0.22 } as const;
export const SWIPE_VELOCITY = 0.45;

/**
 * Which way a released drag goes: 1 = forward (up, or left for branching),
 * -1 = back (down, or right), 0 = settle back where it was. `delta` and
 * `velocity` are in screen pixels (and px/ms), so negative means up/left.
 */
export function swipeDirection(delta: number, velocity: number, size: number, axis: 'x' | 'y'): -1 | 0 | 1 {
  const share = SWIPE_DISTANCE[axis];
  if (delta < -size * share || velocity < -SWIPE_VELOCITY) return 1;
  if (delta > size * share || velocity > SWIPE_VELOCITY) return -1;
  return 0;
}

/** Past the first or last card the feed gives a little, then resists. */
export function rubberBand(p: number, min: number, max: number, give = 0.3): number {
  if (p < min) return min + (p - min) * give;
  if (p > max) return max + (p - max) * give;
  return p;
}

/** Which axis a drag belongs to, once it has moved far enough to tell. */
export function dragAxis(dx: number, dy: number, threshold = 8): 'x' | 'y' | null {
  if (Math.hypot(dx, dy) <= threshold) return null;
  return Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
}
