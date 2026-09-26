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
  /** Sleeve image for the record the page is showing; the logo puts it on its label. */
  cover?: string | null;
  /** Dark sleeve swatch the rest of the page sits on (`--ground`). */
  ground?: string | null;
}

export interface PageFloodExtras {
  /** An image URL the page already shows, for the logo's label. */
  cover?: string | null;
  /** The page's ground, usually the lead sleeve's `ground` swatch. */
  ground?: string | null;
}

export type SetFlood = (next: FloodState | null) => void;

export const DEFAULT_FLOOD: FloodState = { flood: GROUND, ink: CREAM };

export const FloodValueContext = createContext<FloodState>(DEFAULT_FLOOD);
export const FloodSetterContext = createContext<SetFlood>(() => {});

export function useFloodValue(): FloodState {
  return useContext(FloodValueContext);
}

/**
 * Paint the header in this colour while the calling page is mounted. Pass
 * `cover` (an image URL the page already shows) to put that sleeve on the
 * spinning logo's label, and `ground` to tint the whole page's background.
 */
export function usePageFlood(
  flood: string | null | undefined,
  ink: string | null | undefined,
  { cover = null, ground = null }: PageFloodExtras = {},
) {
  const setFlood = useContext(FloodSetterContext);
  useEffect(() => {
    setFlood(flood && ink ? { flood, ink, cover, ground } : null);
  }, [flood, ink, cover, ground, setFlood]);
  useEffect(() => () => setFlood(null), [setFlood]);
}
