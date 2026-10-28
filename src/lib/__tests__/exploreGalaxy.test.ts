import { describe, expect, it } from 'vitest';
import { layoutGalaxy } from '@/lib/explore/galaxyForce';
import {
  clearOfEachOther,
  closeUps,
  cropWindow,
  connectionGroups,
  discPaint,
  edgePoint,
  focusDistance,
  forceJob,
  layoutCacheKey,
  linkBetween,
  linkKind,
  linkStrength,
  orbitRings,
  pathAfterVisit,
  prepareGalaxy,
  reasonLines,
  searchArtists,
  spreadPinned,
  type Pinned,
} from '@/lib/explore/galaxyLayout';
import type { ExploreAlbum, ExploreArtist, ExploreData, ExploreLink } from '@/lib/explore/types';
import { vinylLook } from '@/lib/vinylLook';

const album = (slug: string, a: number[], fam: string, fl = '#c81d25'): ExploreAlbum => ({
  slug, t: slug, by: '', a, y: 1977, added: null, g: [], s: [], l: [], c: null, fam, fmt: 'Vinyl',
  vc: null, lis: 0, fl, ink: '#fff', gr: '#111', h: 0, viv: 1, v: [],
});
const artist = (slug: string, name: string, records: number[]): ExploreArtist => ({
  slug, name, bio: '', genre: null, mood: null, cc: null, from: null, born: null, formed: null, died: null,
  fanart: null, photo: null, focus: null, crop: null, members: [], videos: [], records,
});

const links: ExploreLink[] = [
  // King Crimson – Yes: a shared member, said three ways
  {
    a: 0,
    b: 1,
    why: [
      { type: 'bandmate', who: 'Bill Bruford', person: 0 },
      { type: 'member', who: 'Bill Bruford', from: 1 },
      { type: 'shared-credit', who: 'Eddy Offord', person: 1, albums: [0, 1], roles: ['Engineer', 'Producer'], kinds: ['engineered', 'produced'] },
    ],
  },
  // Yes – Talk Talk: only a shared sleeve designer
  { a: 1, b: 2, why: [{ type: 'shared-credit', who: 'Roger Dean', person: 2, albums: [1, 2], roles: ['Design', 'Design'], kinds: ['designed', 'designed'] }] },
  // Talk Talk – Various: Various is never drawn
  { a: 2, b: 3, why: [{ type: 'guest', album: 2, track: 'x', host: 2, guest: 3 }] },
];

const data: ExploreData = {
  v: 1,
  generated: '2026-10-28T12:00:00Z',
  families: [
    { key: 'prog', code: 'A1', name: 'Prog & Psych' },
    { key: 'pop', code: 'A3', name: 'Pop' },
  ],
  albums: [album('red', [0], 'prog'), album('close-to-the-edge', [1], 'prog', '#1f8a4c'), album('spirit-of-eden', [2], 'pop'), album('now-1', [3], 'pop'), album('fragile', [1], 'pop')],
  artists: [
    artist('king-crimson', 'King Crimson', [0]),
    artist('yes', 'Yes', [1, 4]),
    artist('talk-talk', 'Talk Talk', [2]),
    artist('various', 'Various', [3]),
    artist('the-nobody', 'The Nobody', []),
  ],
  people: [],
  links,
  atlas: { sleeve: 64, cols: 64, sheets: 1, avatar: 64, avatarCols: 40, avatarRows: 1 },
};

describe('galaxy preparation', () => {
  const p = prepareGalaxy(data);

  it('leaves Various and artists without records off the map', () => {
    expect([...p.hidden]).toEqual([0, 0, 0, 1, 1]);
    expect(p.visible).toBe(3);
    expect(p.size[3]).toBe(0);
    expect(p.links).toHaveLength(2);
  });

  it('files an artist in the family most of their records are in, first record breaking ties', () => {
    expect(p.fam[0]).toBe(0);
    expect(p.fam[1]).toBe(0); // one prog, one pop: the first record wins
    expect(p.fam[2]).toBe(1);
    expect(p.famCount).toEqual([2, 1]);
  });

  it('sizes stars by records held', () => {
    expect(p.size[1]).toBeGreaterThan(p.size[0]);
  });

  it('colours a trail by its strongest reason and pulls harder for members than shared designers', () => {
    expect(linkKind(links[0])).toBe(1);
    expect(linkKind(links[1])).toBe(4);
    expect(linkStrength(links[0])).toBeGreaterThan(linkStrength(links[1]));
  });

  it('finds the link between two artists either way round', () => {
    expect(linkBetween(p, 0, 1)).toBe(0);
    expect(linkBetween(p, 1, 0)).toBe(0);
    expect(linkBetween(p, 0, 2)).toBe(-1);
  });

  it('says why once per person, strongest first', () => {
    const lines = reasonLines(data, links[0].why, 0, 1);
    expect(lines[0]).toBe('Bill Bruford played in both King Crimson and Yes');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^Eddy Offord engineered red and produced close-to-the-edge/);
  });

  it('groups connections by trail kind', () => {
    const groups = connectionGroups(data, p, 1);
    expect(groups.map(g => g.kind)).toEqual([1, 4]);
    expect(groups[0].items[0].other).toBe(0);
  });

  it('searches names, those starting with the query first, ignoring a leading "The"', () => {
    expect(searchArtists(data, p, 'tal')).toEqual([2]);
    expect(searchArtists(data, p, 'nobody')).toEqual([]); // hidden
    expect(searchArtists(data, p, '')).toEqual([]);
  });

  it('keys the layout cache on the data build', () => {
    expect(layoutCacheKey(data)).toContain('2026-10-28T12:00:00Z');
    expect(layoutCacheKey({ ...data, generated: 'later' })).not.toBe(layoutCacheKey(data));
  });
});

describe('galaxy layout', () => {
  const p = prepareGalaxy(data);
  const job = forceJob(p, 120);

  it('is the same every time', () => {
    expect(Array.from(layoutGalaxy(job))).toEqual(Array.from(layoutGalaxy(job)));
  });

  it('keeps linked artists in a family closer than the family is wide', () => {
    const P = layoutGalaxy(job);
    const d01 = Math.hypot(P[0] - P[3], P[1] - P[4], P[2] - P[5]);
    expect(d01).toBeLessThan(p.radii[0] * 2);
    for (const v of P) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('hop path', () => {
  it('adds new artists and cuts back to one already visited', () => {
    expect(pathAfterVisit([], 4)).toEqual([4]);
    expect(pathAfterVisit([4, 7], 9)).toEqual([4, 7, 9]);
    expect(pathAfterVisit([4, 7, 9], 7)).toEqual([4, 7]);
    expect(pathAfterVisit([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });
});

describe('orbit and camera', () => {
  it('puts every record on a ring and widens rings outwards', () => {
    const { rings, outer } = orbitRings(40, 12);
    expect(rings.reduce((s, r) => s + r.m, 0)).toBe(40);
    for (let k = 1; k < rings.length; k++) expect(rings[k].R).toBeGreaterThan(rings[k - 1].R);
    expect(outer).toBeGreaterThan(rings[0].R);
  });

  it('sits far enough back for the rings, never closer than 80, further on a tall screen', () => {
    expect(focusDistance(10, [], false)).toBe(80);
    expect(focusDistance(50, [], false)).toBe(180);
    expect(focusDistance(50, [1000, 1000], false)).toBe(250); // capped at 5 × the rings
    expect(focusDistance(50, [], true)).toBe(270);
  });
});

describe('labels on screen', () => {
  const box = { l: 0, t: 0, r: 100, b: 50 };

  it('finds where a ray leaves the box', () => {
    expect(edgePoint(50, 25, 1, 0, box)).toEqual({ x: 100, y: 25, side: 'R' });
    expect(edgePoint(50, 25, 0, -1, box)).toEqual({ x: 50, y: 0, side: 'T' });
    const e = edgePoint(50, 25, -1, -1, box);
    expect(e.side).toBe('T');
    expect(e.x).toBeCloseTo(25);
  });

  it('spreads pinned labels along an edge and hides those pushed off the end', () => {
    const items: Pinned[] = [
      { x: 95, y: 20, w: 10, h: 20, side: 'R' },
      { x: 95, y: 22, w: 10, h: 20, side: 'R' },
      { x: 95, y: 24, w: 10, h: 20, side: 'R' },
    ];
    spreadPinned(items, box);
    expect(items[1].y - items[0].y).toBeGreaterThanOrEqual(24);
    expect(items[2].hidden).toBe(true);
  });

  it('hides labels that would sit on a more important one', () => {
    expect(
      clearOfEachOther([
        { x: 0, y: 0, w: 100, h: 20 },
        { x: 10, y: 5, w: 100, h: 20 },
        { x: 0, y: 100, w: 100, h: 20 },
      ]),
    ).toEqual([true, false, true]);
  });
});

describe('disc paint', () => {
  it('is black for plain records', () => {
    const p = discPaint(null);
    expect(p.alpha).toBe(1);
    expect(p.rgb[0]).toBeLessThan(0.1);
  });

  it('follows the site vinyl colours', () => {
    const red = discPaint(vinylLook('Red'));
    expect(red.rgb[0]).toBeGreaterThan(0.6);
    expect(red.rgb[1]).toBeLessThan(0.3);
    expect(red.alpha).toBe(1);
    expect(discPaint(vinylLook('Clear')).alpha).toBeLessThan(0.6);
    expect(discPaint(vinylLook('Blue Translucent')).alpha).toBeLessThan(1);
    expect(discPaint(vinylLook('Clear w/ Red Splatter')).pattern).toBe(2);
    expect(discPaint(vinylLook('Blue Marbled')).pattern).toBe(1);
  });
});

describe('close-ups', () => {
  it('uses the avatar square when there is one, else the centre square', () => {
    expect(cropWindow([0.192, 0, 0.72, 1], 1.39)).toEqual([0.192, 0, 0.72, 1]);
    expect(cropWindow(null, 1)).toEqual([0, 0, 1, 1]);
    const wide = cropWindow(null, 2);
    expect(wide[0]).toBeCloseTo(0.25);
    expect(wide[2]).toBeCloseTo(0.5);
    const tall = cropWindow(null, 0.5);
    expect(tall[1]).toBeCloseTo(0.25);
    expect(tall[3]).toBeCloseTo(0.5);
  });

  it('picks the biggest stars on screen past the threshold, up to the pool size', () => {
    expect(closeUps([0, 40, 10, 90, 30], 28, 2)).toEqual([3, 1]);
    expect(closeUps([5, 6], 28, 4)).toEqual([]);
  });

  it('weakens springs for shared credits and busy artists', () => {
    const p = prepareGalaxy(data);
    const job = forceJob(p);
    // Yes has two links, so the King Crimson link is divided by √1 (King Crimson has one); the shared designer link is cut further
    expect(job.strength[0]).toBeCloseTo(p.strength[0]);
    expect(job.strength[1]).toBeLessThan(p.strength[1] * 0.3);
  });
});
