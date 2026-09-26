import { useMemo } from 'react';
import { useAlbumColorMap, type AlbumColorPalette } from '@/hooks/useAlbumColors';
import { floodFor, pageGround, type Flood } from '@/lib/sleeveColour';
import { usePageFlood } from './flood-context';

/** How many of a page's leading records colour its band. */
const LEAD = 3;

export interface RecordsFlood {
  /** Solid band colour: the most vivid of the lead sleeves. */
  background: string;
  /** Same colour (the nav paints itself in it). */
  top: string;
  ink: string;
  sub: string;
  /** The same sleeve's dark swatch (tinted by the flood when it is neutral), for the rest of the page. */
  ground: string;
}

type ColourMap = Record<string, AlbumColorPalette> | null;

/**
 * Colours for a page from the first few records it shows: the boldest of
 * them paints the header band (one solid colour, no blend) and its dark
 * swatch tints everything under it, so no page sits on plain black.
 */
export function recordsFlood(uris: Array<string | null | undefined>, map: ColourMap, count = LEAD): RecordsFlood | null {
  const lead = uris.filter((u): u is string => !!u).slice(0, count);
  if (!lead.length || !map) return null;
  let pick = map[lead[0]];
  for (const u of lead) if ((map[u]?.vivid ?? 0) > (pick?.vivid ?? 0)) pick = map[u];
  const f = floodFor(pick);
  return bandFromFlood(f);
}

/**
 * Colours from the newest record that has a colour of its own: the first
 * uri whose sleeve is not monochrome, else the first uri's neutral. Unlike
 * `recordsFlood` this never hunts for the boldest sleeve, which would let one
 * saturated (usually red) cover win every page it appears on.
 */
export function newestFlood(uris: Array<string | null | undefined>, map: ColourMap): RecordsFlood | null {
  const known = uris.filter((u): u is string => !!u);
  if (!known.length || !map) return null;
  const pick = known.find(u => (map[u]?.vivid ?? 0) > 0) ?? known[0];
  return bandFromFlood(floodFor(map[pick]));
}

/** A band from a single sleeve's flood (a genre's or facet's lead record). */
export function bandFromFlood(f: Flood): RecordsFlood {
  return { background: f.flood, top: f.flood, ink: f.ink, sub: f.sub, ground: pageGround(f) };
}

/**
 * Paint the page (nav, header band, ground) from its leading records. Pass
 * the uris in display order; the result is null until colours have loaded.
 */
export function useRecordsFlood(uris: Array<string | null | undefined>, count = LEAD): RecordsFlood | null {
  const map = useAlbumColorMap();
  const key = uris.slice(0, count).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flood = useMemo(() => recordsFlood(uris, map, count), [key, map, count]);
  usePageBand(flood);
  return flood;
}

/** Hand a band's colours to the nav and the page ground. */
export function usePageBand(band: RecordsFlood | null) {
  usePageFlood(band?.top, band?.ink, { ground: band?.ground });
}
