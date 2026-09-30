import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { COLOUR_FAMILIES, colourFamily, type ColourFamily } from './sleeveColour';

export interface FamilyJump {
  id: ColourFamily;
  label: string;
  /** Paint-chip colour (a CSS background). */
  chip: string;
  /** Index of the family's first record in the list. */
  index: number;
  count: number;
}

/**
 * Where each colour family starts in a colour-sorted list, in list order.
 * Families with no records are left out.
 */
export function familyJumps(uris: string[], colours: Record<string, AlbumColorPalette>): FamilyJump[] {
  const found = new Map<ColourFamily, { index: number; count: number }>();
  uris.forEach((uri, index) => {
    const id = colourFamily(colours[uri]);
    const hit = found.get(id);
    if (hit) hit.count++;
    else found.set(id, { index, count: 1 });
  });
  return COLOUR_FAMILIES.filter(f => found.has(f.id))
    .map(f => ({ id: f.id, label: f.label, chip: f.chip, ...found.get(f.id)! }))
    .sort((a, b) => a.index - b.index);
}
