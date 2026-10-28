/**
 * What a Thread card shows: its image, its colours and its text. Kept apart
 * from the components so the feed, the trail strip, the preloader and the
 * details panel agree on them.
 */
import { getArtistAvatarUrl } from '@/lib/image-utils';
import { CREAM, GROUND } from '@/lib/sleeveColour';
import { artistPhotoUrl, fanartUrl, sleeveUrl, ytThumb, type Explore } from './data';
import { labelName, videoTitle, cleanVideoTitle, type ThreadNode } from './thread';

/** The card's main image: fanart (else the artist photo), the sleeve, or the video poster. */
export function cardImageUrl(d: Explore, n: Pick<ThreadNode, 'kind' | 'i' | 'view' | 'vid'>): string {
  if (n.view === 'video' && n.vid) return ytThumb(n.vid[0]);
  if (n.kind === 'r') return sleeveUrl(d.albums[n.i], 'medium');
  const a = d.artists[n.i];
  return (n.view === 'fanart' && fanartUrl(a)) || artistPhotoUrl(a, 'hi-res');
}

/** A small square for the trail strip and lists: the sleeve, or the artist avatar. */
export function thumbUrl(d: Explore, n: { kind: 'a' | 'r'; i: number }): string {
  return n.kind === 'r' ? sleeveUrl(d.albums[n.i], 'medium') : getArtistAvatarUrl(d.artists[n.i].slug);
}

/** CSS object-position for the artist's focal point (in the fanart when there is one, else the photo). */
export function focusPosition(d: Explore, artist: number): string {
  const f = d.artists[artist].focus ?? [0.5, 0.35];
  return `${(f[0] * 100).toFixed(1)}% ${(f[1] * 100).toFixed(1)}%`;
}

export interface CardPalette {
  flood: string;
  ink: string;
  ground: string;
  /** The sleeve the nav's logo carries. */
  cover: string | null;
}

/** The artist's newest record in the collection: their colour on the site. */
export function newestRecord(d: Explore, artist: number): number | null {
  const recs = d.artists[artist].records;
  if (!recs.length) return null;
  return recs.reduce((best, i) => ((d.albums[i].added ?? '') > (d.albums[best].added ?? '') ? i : best), recs[0]);
}

/** The colours for a card and the nav above it: a record's own flood, an artist's newest record's. */
export function cardPalette(d: Explore, n: { kind: 'a' | 'r'; i: number }): CardPalette {
  const ri = n.kind === 'r' ? n.i : newestRecord(d, n.i);
  if (ri == null) return { flood: GROUND, ink: CREAM, ground: GROUND, cover: null };
  const r = d.albums[ri];
  return { flood: r.fl, ink: r.ink, ground: r.gr, cover: sleeveUrl(r, 'medium') };
}

export interface CardText {
  /** Above the title: "Artist", "Record", "Video · from Fragile". */
  kicker: string;
  title: string;
  /** The artist line on records and videos. */
  by: string | null;
  meta: string;
  /** Second meta line (artists: their record count). */
  meta2: string | null;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function cardText(d: Explore, n: Pick<ThreadNode, 'kind' | 'i' | 'view' | 'vid'>): CardText {
  if (n.kind === 'a') {
    const a = d.artists[n.i];
    const year = a.formed ? `formed ${a.formed}` : a.born ? `born ${a.born}` : '';
    const meta = [a.from, year, a.genre].filter(Boolean).join(' · ');
    const records = `${plural(a.records.length, 'record')} in the collection`;
    if (n.view === 'video' && n.vid) {
      return { kicker: n.vid[2] ? `Video · ${n.vid[2]}` : 'Video', title: cleanVideoTitle(n.vid[1], [a.name]), by: a.name, meta, meta2: records };
    }
    return { kicker: 'Artist', title: a.name, by: null, meta, meta2: records };
  }
  const r = d.albums[n.i];
  const meta = [r.y, labelName(r.l[0]), r.c, r.vc ? `${r.vc} vinyl` : r.fmt].filter(Boolean).join(' · ');
  if (n.view === 'video' && n.vid) {
    const kind = n.vid[2] === 'live' ? 'Live' : n.vid[2] === 'video' ? 'Video' : 'Clip';
    return { kicker: `${kind} · from ${r.t}`, title: videoTitle(d, n.vid, r), by: r.by, meta, meta2: null };
  }
  return { kicker: 'Record', title: r.t, by: r.by, meta, meta2: null };
}

/** The name of an artist or record, for lists and aria labels. */
export function entityName(d: Explore, n: { kind: 'a' | 'r'; i: number }): string {
  return n.kind === 'a' ? d.artists[n.i].name : d.albums[n.i].t;
}

/** Trim a biography to whole sentences. */
export function trimBio(s: string, max = 400): string {
  if (!s || s.length < max) return s;
  const cut = s.slice(0, max);
  const p = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return p > 160 ? cut.slice(0, p + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}
