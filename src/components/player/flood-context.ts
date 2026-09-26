import { createContext, useContext, useEffect } from 'react';
import { CREAM, GROUND } from '@/lib/sleeveColour';

/**
 * The page's current flood colour. Hero sections paint themselves in the
 * sleeve colour of the record they feature; the sticky navigation reads the
 * same value so header and hero form one surface until the page scrolls.
 *
 * The value and the setter live in separate contexts: pages only need the
 * setter, so a flood change re-renders the navigation and not the page that
 * set it.
 */
export interface FloodState {
  flood: string;
  ink: string;
}

export type SetFlood = (next: FloodState | null) => void;

export const DEFAULT_FLOOD: FloodState = { flood: GROUND, ink: CREAM };

export const FloodValueContext = createContext<FloodState>(DEFAULT_FLOOD);
export const FloodSetterContext = createContext<SetFlood>(() => {});

export function useFloodValue(): FloodState {
  return useContext(FloodValueContext);
}

/** Paint the header in this colour while the calling page is mounted. */
export function usePageFlood(flood: string | null | undefined, ink: string | null | undefined) {
  const setFlood = useContext(FloodSetterContext);
  useEffect(() => {
    setFlood(flood && ink ? { flood, ink } : null);
  }, [flood, ink, setFlood]);
  useEffect(() => () => setFlood(null), [setFlood]);
}
