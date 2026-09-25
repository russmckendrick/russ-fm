import { createContext, useContext, useEffect } from 'react';
import { CREAM, GROUND } from '@/lib/sleeveColour';

/**
 * The page's current flood colour. Hero sections paint themselves in the
 * sleeve colour of the record they feature; the sticky navigation reads the
 * same value so header and hero form one surface until the page scrolls.
 */
export interface FloodState {
  flood: string;
  ink: string;
}

export interface FloodContextValue extends FloodState {
  setFlood: (next: FloodState | null) => void;
}

export const DEFAULT_FLOOD: FloodState = { flood: GROUND, ink: CREAM };

export const FloodContext = createContext<FloodContextValue>({ ...DEFAULT_FLOOD, setFlood: () => {} });

export function useFloodValue(): FloodState {
  const { flood, ink } = useContext(FloodContext);
  return { flood, ink };
}

/** Paint the header in this colour while the calling page is mounted. */
export function usePageFlood(flood: string | null | undefined, ink: string | null | undefined) {
  const { setFlood } = useContext(FloodContext);
  useEffect(() => {
    setFlood(flood && ink ? { flood, ink } : null);
  }, [flood, ink, setFlood]);
  useEffect(() => () => setFlood(null), [setFlood]);
}
