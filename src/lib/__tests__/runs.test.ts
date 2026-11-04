import { describe, expect, it } from 'vitest';
import { albumRunOf, letterOf, monthRun } from '../runs';

const rec = (o: Partial<Parameters<typeof albumRunOf>[0]> = {}) => ({
  release_name: 'Evil Heat',
  release_artist: 'Primal Scream',
  date_added: '2026-11-03',
  year_original: 2002,
  date_release_year: '2002-08-05',
  ...o,
});

describe('runs', () => {
  it('files names by first letter, accents dropped, digits under #', () => {
    expect(letterOf('Émilie Simon')).toBe('E');
    expect(letterOf('808 State')).toBe('#');
    expect(letterOf('...And You Will Know Us')).toBe('#');
  });

  it('files records by month added, title, artist and decade', () => {
    expect(monthRun('2026-11-03')).toEqual({ key: '2026-11', label: 'Nov', year: '2026' });
    expect(albumRunOf(rec(), 'release_name')?.label).toBe('E');
    expect(albumRunOf(rec(), 'release_artist')?.label).toBe('P');
    expect(albumRunOf(rec(), 'date_release_year')).toEqual({ key: '2000', label: '2000', year: 'to 2009' });
    expect(albumRunOf(rec({ year_original: 1979 }), 'date_release_year')?.label).toBe('1970');
    expect(albumRunOf(rec({ year_original: null, date_release_year: '' }), 'date_release_year')?.key).toBe('none');
    expect(albumRunOf(rec(), 'colour')).toBeNull();
  });
});
