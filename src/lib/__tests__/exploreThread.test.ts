import { describe, expect, it } from 'vitest';
import { indexExplore } from '@/lib/explore/data';
import {
  albumOuts,
  artistOuts,
  cleanVideoTitle,
  connect,
  labelName,
  mulberry32,
  parseThreadParams,
  rngFor,
  Thread,
  threadIndex,
  vinylFamily,
} from '@/lib/explore/thread';
import { dragAxis, rubberBand, springStep, swipeDirection } from '@/lib/explore/threadMotion';
import type { ExploreAlbum, ExploreArtist, ExploreData } from '@/lib/explore/types';

const album = (slug: string, t: string, a: number[], extra: Partial<ExploreAlbum> = {}): ExploreAlbum => ({
  slug, t, by: '', a, y: 1977, added: '2024-01-01', g: [], s: [], l: [], c: 'UK', fam: 'prog', fmt: 'Vinyl',
  vc: null, lis: 0, fl: '#c33', ink: '#fff', gr: '#200', h: 0, viv: 1, v: [], ...extra,
});
const artist = (slug: string, name: string, records: number[], extra: Partial<ExploreArtist> = {}): ExploreArtist => ({
  slug, name, bio: '', genre: null, mood: null, cc: null, from: null, born: null, formed: null, died: null,
  fanart: null, photo: null, crop: null, focus: null, members: [], videos: [], records, ...extra,
});

// Bowie (0) and T. Rex (1) share Tony Visconti; Fripp (2) plays on "Heroes"; King Crimson (3)
// shares Fripp; Eno (4) is on its own label with Bowie's Low.
const data: ExploreData = {
  v: 1,
  generated: '',
  families: [{ key: 'prog', code: 'P', name: 'Prog & Psych' }],
  albums: [
    album('heroes', '"Heroes"', [0], { l: ['RCA'], s: ['Art Rock'], added: '2024-03-01', vc: 'Red Translucent' }),
    album('electric-warrior', 'Electric Warrior', [1], { l: ['Fly'], s: ['Glam'], y: 1971 }),
    album('exposure', 'Exposure', [2], { l: ['Polydor'], y: 1979 }),
    album('red', 'Red', [3], { l: ['Island'], s: ['Art Rock'], y: 1974, v: [['abcdefghijk', 'King Crimson - Starless (Official Video)', 'video']] }),
    album('low', 'Low', [0], { l: ['RCA'], added: '2024-01-01' }),
    album('before-and-after-science', 'Before And After Science', [4], { l: ['RCA'], vc: 'Red' }),
  ],
  artists: [
    artist('david-bowie', 'David Bowie', [0, 4], { fanart: 'david-bowie-fanart01.jpg', focus: [0.4, 0.3] }),
    artist('t-rex', 'T. Rex', [1]),
    artist('robert-fripp', 'Robert Fripp', [2]),
    artist('king-crimson', 'King Crimson', [3], { fanart: 'king-crimson-fanart03.jpg' }),
    artist('brian-eno', 'Brian Eno', [5]),
  ],
  people: [
    { id: '1', name: 'Tony Visconti', thumb: null, bands: [], artist: null, credits: [[0, 'Producer', 'produced'], [1, 'Producer', 'produced']] },
    { id: '2', name: 'Robert Fripp', thumb: null, bands: [3], artist: 2, credits: [[0, 'Lead Guitar', 'played']] },
  ],
  links: [
    { a: 0, b: 1, why: [{ type: 'shared-credit', who: 'Tony Visconti', person: 0, albums: [0, 1], roles: ['Producer', 'Producer'], kinds: ['produced', 'produced'] }] },
    { a: 0, b: 2, why: [{ type: 'credit', who: 'Robert Fripp', person: 1, album: 0, role: 'Lead Guitar', kind: 'played' }] },
    { a: 2, b: 3, why: [{ type: 'member', who: 'Robert Fripp', from: 3 }, { type: 'bandmate', who: 'Robert Fripp', person: 1 }] },
    { a: 3, b: 0, why: [{ type: 'bandmate', who: 'Robert Fripp', person: 1 }] },
  ],
  atlas: { sleeve: 64, cols: 64, sheets: 1, avatar: 64, avatarCols: 40, avatarRows: 1 },
};
const d = indexExplore(data);
const ix = threadIndex(d);

describe('seeded randomness', () => {
  it('repeats for the same seed and differs between seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(rngFor('x', 1)()).not.toBe(rngFor('y', 1)());
  });
});

describe('ways out', () => {
  it('turns artist links, credits and records into hops with plain reasons', () => {
    const outs = artistOuts(d, ix, 0, mulberry32(1));
    const texts = outs.map(o => o.text);
    expect(texts).toContain('Tony Visconti produced “Heroes” and Electric Warrior');
    expect(texts).toContain('Robert Fripp played lead guitar on “Heroes”');
    expect(texts).toContain('Robert Fripp played in both David Bowie and King Crimson');
    expect(outs.filter(o => o.type === 'record').map(o => o.i).sort()).toEqual([0, 4]);
    // A credited artist hops to the record they're on.
    expect(artistOuts(d, ix, 2, mulberry32(1)).find(o => o.kind === 'r' && o.i === 0)?.type).toBe('credit');
  });

  it('hops from a record to another with the same producer, and to its credited players', () => {
    const outs = albumOuts(d, ix, 0, mulberry32(1));
    const same = outs.find(o => o.type === 'same-credit');
    expect(same).toMatchObject({ kind: 'r', i: 1, text: 'Tony Visconti produced “Heroes” and Electric Warrior' });
    expect(outs.find(o => o.type === 'credit')).toMatchObject({ kind: 'a', i: 2, text: 'Robert Fripp played lead guitar on “Heroes”' });
    expect(outs.find(o => o.type === 'style')).toMatchObject({ i: 3, text: 'Also filed under Art Rock' });
    expect(outs.find(o => o.type === 'colour')).toMatchObject({ i: 5, text: 'Also on red vinyl' });
    // Same label, but by the same artist: not a hop.
    expect(outs.some(o => o.type === 'label' && o.i === 4)).toBe(false);
  });

  it('finds a reason for any hop it did not make itself', () => {
    expect(connect(d, ix, { kind: 'r', i: 4 }, 'r', 5).text).toBe('Same label, same year: RCA, 1977');
    expect(connect(d, ix, { kind: 'r', i: 0 }, 'r', 4).text).toBe('Also by ');
    expect(connect(d, ix, { kind: 'r', i: 0 }, 'a', 0).type).toBe('artist');
    expect(connect(d, ix, { kind: 'a', i: 1 }, 'a', 4).type).toBe('jump');
  });
});

describe('the trail', () => {
  it('starts from a seed artist on their photo, with other starting points beside it', () => {
    const t = new Thread(d, 'test').start({ seed: 'king-crimson' });
    expect(t.trail[0]).toMatchObject({ kind: 'a', i: 3, view: 'fanart' });
    expect(t.trail[0].via.sub).toBe('King Crimson has 2 links to other artists in the collection');
    expect(t.trail.length).toBe(3); // two cards ahead
  });

  it('never revisits a card already on the trail and keeps the best link first', () => {
    const t = new Thread(d, 'test').start({ seed: 'robert-fripp' });
    const keys = t.trail.map(n => `${n.kind}${n.i}`);
    expect(new Set(keys).size).toBe(keys.length);
    const outs = t.trail[0].outs!;
    expect(outs[0].kind).toBe('a');
    for (let k = 0; k < 6; k++) t.go(t.cur + 1);
    const all = t.trail.slice(0, t.cur + 1).map(n => `${n.kind}${n.i}`);
    expect(new Set(all).size).toBe(all.length);
  });

  it('branches to another way out of the card before', () => {
    const t = new Thread(d, 'test').start({ seed: 'david-bowie' });
    t.go(1);
    const before = t.current;
    const next = t.branch(1)!;
    expect(next).not.toBe(before);
    expect(next.alt).toBe((before.alt + 1) % before.alts.length);
    expect(t.trail[1]).toBe(next);
    expect(t.maxSeen).toBe(1);
  });

  it('replays a shared trail with the same cards, reasons and card types', () => {
    const t = new Thread(d, 'share').start({ seed: 'david-bowie' });
    t.go(1);
    t.branch(1);
    t.go(2);
    t.go(3);
    const params = parseThreadParams(new URLSearchParams(t.search()));
    expect(params.r).toBe('share');
    const replay = new Thread(d, params.r!).start(params);
    const shape = (x: Thread) => x.trail.slice(0, x.maxSeen + 1).map(n => [n.kind, n.i, n.via.text, n.view, n.vid?.[0] ?? null]);
    expect(shape(replay)).toEqual(shape(t));
    expect(replay.cur).toBe(t.cur);
  });

  it('makes a picked record the next card', () => {
    const t = new Thread(d, 'test').start({ seed: 'david-bowie' });
    const hop = t.connectFromCurrent('r', 4);
    const n = t.setNext(hop);
    expect(t.trail[1]).toBe(n);
    expect(n.via.text).toBe('One of 2 David Bowie records in the collection');
  });
});

describe('text helpers', () => {
  it('cleans labels, video titles and vinyl colours', () => {
    expect(labelName('RCA (2)')).toBe('RCA');
    expect(cleanVideoTitle('King Crimson - Starless (Official Video)', ['King Crimson'])).toBe('Starless');
    expect(vinylFamily('Red Translucent')).toBe('Red');
    expect(vinylFamily(null)).toBeNull();
  });
});

describe('feed motion', () => {
  it('springs onto the target and stops', () => {
    let s = { x: 0, v: 0, moving: true };
    let frames = 0;
    while (s.moving && frames < 240) {
      s = springStep(s.x, s.v, 1, 1 / 60);
      frames++;
    }
    expect(s.x).toBe(1);
    expect(frames).toBeLessThan(90);
  });

  it('crossfades in a straight line with reduced motion', () => {
    const s = springStep(0, 0, 1, 0.11, true);
    expect(s.x).toBeCloseTo(0.5);
    expect(springStep(0.9, 0, 1, 0.11, true)).toEqual({ x: 1, v: 0, moving: false });
  });

  it('decides swipes by distance or flick speed', () => {
    expect(swipeDirection(-200, 0, 800, 'y')).toBe(1);
    expect(swipeDirection(-40, -0.8, 800, 'y')).toBe(1);
    expect(swipeDirection(40, 0.1, 800, 'y')).toBe(0);
    expect(swipeDirection(200, 0, 400, 'x')).toBe(-1);
    expect(dragAxis(3, 4)).toBeNull();
    expect(dragAxis(20, 4)).toBe('x');
    expect(rubberBand(-1, 0, 5)).toBeCloseTo(-0.3);
  });
});
