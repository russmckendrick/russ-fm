import { originalYear } from '@/lib/releaseYear';
import type { Album } from '@/types/album';

/**
 * Runs: the stretches a sorted grid is filed in, each led by a divider card
 * (RunDivider), like the dividers in a record shop's bins.
 */
export interface Run {
  key: string;
  /** Big on the card: a letter, a month, a decade. */
  label: string;
  /** Small under it: the year of a month, where a decade ends. */
  year?: string;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The A–Z bucket for a name: its first letter, accents dropped, or "#" for digits and punctuation. */
export function letterOf(name: string): string {
  const first = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

/** The month of a YYYY-MM-DD date. */
export function monthRun(date: string): Run {
  const [year, month] = date.split('-');
  return { key: `${year}-${month}`, label: MONTHS[Number(month) - 1] ?? month, year };
}

/** The run a record is filed under for an /albums sort; null for sorts without runs (Colour). */
export function albumRunOf(album: Pick<Album, 'release_name' | 'release_artist' | 'date_added' | 'year_original' | 'date_release_year'>, sort: string): Run | null {
  switch (sort) {
    case 'date_added':
      return monthRun(album.date_added);
    case 'release_name':
      return { key: letterOf(album.release_name), label: letterOf(album.release_name) };
    case 'release_artist':
      return { key: letterOf(album.release_artist), label: letterOf(album.release_artist) };
    case 'date_release_year': {
      const y = originalYear(album);
      if (!y) return { key: 'none', label: '?' };
      const decade = Math.floor(y / 10) * 10;
      // Digits, not "90s": the display face is upper case and would set it 90S.
      return { key: String(decade), label: String(decade), year: `to ${decade + 9}` };
    }
    default:
      return null;
  }
}
