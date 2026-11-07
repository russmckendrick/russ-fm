import { describe, it, expect } from 'vitest';
import { labelNames, titleLines } from '../releaseLabel';

describe('titleLines', () => {
  it('keeps a short title on one line', () => {
    expect(titleLines('REQUIEM FOR A VILLAGE')).toEqual(['REQUIEM FOR A VILLAGE']);
  });

  it('splits a longer title into lines of similar length', () => {
    const lines = titleLines('THE BONES OF WHAT YOU BELIEVE (10 YEAR ANNIVERSARY SPECIAL EDITION)');
    expect(lines).toHaveLength(3);
    expect(lines.join(' ')).toBe('THE BONES OF WHAT YOU BELIEVE (10 YEAR ANNIVERSARY SPECIAL EDITION)');
    expect(Math.max(...lines.map(l => l.length))).toBeLessThanOrEqual(30);
  });

  it('never splits a single long word', () => {
    expect(titleLines('SUPERCALIFRAGILISTICEXPIALIDOCIOUSLY')).toEqual(['SUPERCALIFRAGILISTICEXPIALIDOCIOUSLY']);
  });
});

describe('labelNames', () => {
  it('lists each label once, without Discogs disambiguation', () => {
    expect(labelNames(['Goodbye Records (2)', 'Goodbye Records (2)', 'EMI', 'Glassnote (2)'])).toEqual(['Goodbye Records', 'EMI', 'Glassnote']);
  });
});
