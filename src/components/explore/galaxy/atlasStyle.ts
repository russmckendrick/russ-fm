import type { CSSProperties } from 'react';
import { AVATAR_SHEET_URL, sleeveCell, sleeveSheetUrl } from '@/lib/explore/data';
import type { ExploreData } from '@/lib/explore/types';

/** CSS for one cell of an atlas sheet drawn as a background. */
function atlasStyle(url: string, cols: number, rows: number, col: number, row: number): CSSProperties {
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export function avatarStyle(d: ExploreData, i: number): CSSProperties {
  const { avatarCols, avatarRows } = d.atlas;
  return atlasStyle(AVATAR_SHEET_URL, avatarCols, avatarRows, i % avatarCols, Math.floor(i / avatarCols));
}

export function sleeveStyle(d: ExploreData, album: number): CSSProperties {
  const c = sleeveCell(d, album);
  return atlasStyle(sleeveSheetUrl(c.sheet), d.atlas.cols, d.atlas.cols, c.x / c.size, c.y / c.size);
}

