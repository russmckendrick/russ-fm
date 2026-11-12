import { useCallback, useRef, useState } from 'react';
import { useMediaQuery } from './useMediaQuery';

/** The band's top fades in over this many pixels, which hold no text. */
const GLASS_FADE = 40;
/** Below `lg` the band only overlaps the photo by this much (--glass-over in player.css). */
const GLASS_OVERLAP = 120;

/** The `bottomInset` under a band that straddles at every width (`.glass-band-straddle`, the index rooms). */
export const GLASS_STRADDLE_INSET = GLASS_OVERLAP - GLASS_FADE;

/**
 * The glass band (`.glass-band`, player.css) under a hero room or wall: a ref
 * for the band and how much of the photo's bottom it covers, for the room's
 * `bottomInset`. From `lg` the whole band lies over the photo, so that is its
 * height; below, it straddles the photo's bottom edge by a fixed overlap.
 */
export function useGlassBand<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(el);
  }, []);
  const overlaid = useMediaQuery('(min-width: 1024px)');
  return [ref, Math.max(0, (overlaid ? height : Math.min(height, GLASS_OVERLAP)) - GLASS_FADE)];
}
