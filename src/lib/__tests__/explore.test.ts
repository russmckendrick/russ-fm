import { describe, expect, it } from 'vitest';
import { creditKind, creditVerb } from '@/lib/explore/credits';
import { describeLink, indexExplore, sortReasons } from '@/lib/explore/data';
import type { ExploreAlbum, ExploreArtist, ExploreData } from '@/lib/explore/types';

const album = (slug: string, t: string, a: number[]): ExploreAlbum => ({
  slug, t, by: '', a, y: 1977, added: null, g: [], s: ['Art Rock'], l: ['RCA'], c: 'UK', fam: 'prog', fmt: 'Vinyl',
  vc: null, lis: 0, fl: '#000', ink: '#fff', gr: '#111', h: 0, viv: 1, v: [],
});
const artist = (slug: string, name: string, records: number[]): ExploreArtist => ({
  slug, name, bio: '', genre: null, mood: null, cc: null, from: null, born: null, formed: null, died: null,
  fanart: null, photo: null, crop: null, focus: null, members: [], videos: [], records,
});

const data: ExploreData = {
  v: 1,
  generated: '',
  families: [],
  albums: [album('heroes', '"Heroes"', [0]), album('electric-warrior', 'Electric Warrior', [1])],
  artists: [artist('david-bowie', 'David Bowie', [0]), artist('t-rex', 'T. Rex', [1]), artist('robert-fripp', 'Robert Fripp', [])],
  people: [{ id: '55761', name: 'Tony Visconti', thumb: null, bands: [], artist: null, credits: [[0, 'Producer', 'produced'], [1, 'Producer', 'produced']] }],
  links: [
    { a: 0, b: 1, why: [{ type: 'shared-credit', who: 'Tony Visconti', person: 0, albums: [0, 1], roles: ['Producer', 'Producer'], kinds: ['produced', 'produced'] }] },
    { a: 0, b: 2, why: [{ type: 'credit', who: 'Robert Fripp', person: 0, album: 0, role: 'Lead Guitar', kind: 'played' }] },
  ],
  atlas: { sleeve: 64, cols: 64, sheets: 1, avatar: 64, avatarCols: 40, avatarRows: 1 },
};

describe('credit roles', () => {
  it('sorts roles into kinds and skips pressing-plant credits', () => {
    expect(creditKind('Producer')).toBe('produced');
    expect(creditKind('Lead Guitar')).toBe('played');
    expect(creditKind('Design')).toBe('designed');
    expect(creditKind('Mastered By')).toBeNull();
    expect(creditKind('Lacquer Cut By')).toBeNull();
  });

  it('turns a role into a verb', () => {
    expect(creditVerb('played', 'Lead Guitar')).toBe('played lead guitar on');
    expect(creditVerb('played', 'Backing Vocals')).toBe('sang on');
    expect(creditVerb('produced', 'Mixed By')).toBe('mixed');
    expect(creditVerb('designed', 'Photography By')).toBe('photographed');
  });
});

describe('explore graph', () => {
  const d = indexExplore(data);

  it('indexes neighbours both ways and credits by record', () => {
    expect(d.neighbours[1].map(n => n.other)).toEqual([0]);
    expect(d.neighbours[0].map(n => n.other)).toEqual([1, 2]);
    expect(d.creditsOn.get(1)).toEqual([{ person: 0, role: 'Producer' }]);
    expect(d.byLabel.get('RCA')).toEqual([0, 1]);
  });

  it('names records in the order of the hop', () => {
    const why = d.links[0].why[0];
    expect(describeLink(d, why, 1, 0)).toBe('Tony Visconti produced Electric Warrior and "Heroes"');
    expect(describeLink(d, why, 0, 1)).toBe('Tony Visconti produced "Heroes" and Electric Warrior');
    expect(describeLink(d, d.links[1].why[0], 2, 0)).toBe('Robert Fripp played lead guitar on "Heroes"');
  });

  it('puts the strongest reason first', () => {
    const sorted = sortReasons([...d.links[0].why, ...d.links[1].why]);
    expect(sorted[0].type).toBe('credit');
  });
});
