import { describe, it, expect } from 'vitest';
import { basePosition, isHeadingRow, isSuiteRow, sideRuntime, sidingPosition, vinylSide } from '../tracklistRows';

describe('tracklistRows', () => {
  it('strips the movement suffix from every Discogs movement style', () => {
    const base = (position: string) => basePosition({ position, parent: 'Suite' });
    expect(['A-I', 'A-VII', 'B2 i', 'B2 vii', 'A1.1', 'A3-a', 'A2a', 'E1-IV', '2-4.1'].map(base)).toEqual([
      'A', 'A', 'B2', 'B2', 'A1', 'A3', 'A2', 'E1', '2-4',
    ]);
    // Only movements are trimmed; a plain track keeps its position.
    expect(basePosition({ position: 'A2a' })).toBe('A2a');
    expect(base('CD-1')).toBe('CD-1');
  });

  it('reads vinyl sides and leaves CD positions alone', () => {
    expect([vinylSide('A1'), vinylSide('B'), vinylSide('CD-1'), vinylSide('1-4'), vinylSide('')]).toEqual(['A', 'B', null, null, null]);
  });

  it('sides a suite by its first movement', () => {
    const rows = [
      { name: '2112', position: '', type: 'index' },
      { name: 'Overture', position: 'A-I', parent: '2112' },
      { name: 'A Passage To Bangkok', position: 'B1' },
    ];
    expect(rows.map((_, i) => vinylSide(sidingPosition(rows, i)))).toEqual(['A', 'A', 'B']);
  });

  it('tells suites from headings, including untyped legacy headings', () => {
    expect(isSuiteRow({ type: 'index' })).toBe(true);
    expect(isHeadingRow({ type: 'index' })).toBe(false);
    expect(isHeadingRow({ type: 'heading', position: '' })).toBe(true);
    expect(isHeadingRow({ position: '' })).toBe(true);
    expect(isHeadingRow({ position: '', duration_ms: 1000 })).toBe(false);
    expect(isHeadingRow({ position: 'A1' })).toBe(false);
  });
});

describe('sideRuntime', () => {
  it('adds up the timed tracks and skips headings', () => {
    const rows = [
      { name: 'Side A', type: 'heading' },
      { name: 'One', position: 'A1', duration_ms: 60000 },
      { name: 'Two', position: 'A2' },
      { name: 'Three', position: 'A3', duration_ms: 120000 },
    ];
    expect(sideRuntime(rows)).toEqual({ totalMs: 180000, timed: [1, 3] });
  });

  it('counts a suite once: by its movements when they are timed', () => {
    const rows = [
      { name: '2112', type: 'index', duration_ms: 300000 },
      { name: 'Overture', position: 'A-I', parent: '2112', duration_ms: 100000 },
      { name: 'Temples', position: 'A-II', parent: '2112', duration_ms: 200000 },
    ];
    expect(sideRuntime(rows)).toEqual({ totalMs: 300000, timed: [1, 2] });
  });

  it('counts an untimed-movement suite by its own length', () => {
    const rows = [
      { name: 'Suite', type: 'index', duration_ms: 300000 },
      { name: 'Part 1', position: 'A1', parent: 'Suite' },
    ];
    expect(sideRuntime(rows)).toEqual({ totalMs: 300000, timed: [0] });
  });
});
