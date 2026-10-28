/**
 * public/explore/explore.json, written by scripts/generate-explore.ts.
 *
 * Keys are short because the file carries every record and artist. Records,
 * artists and people refer to each other by index into these arrays.
 */

import type { CreditKind } from './credits';

export interface ExploreFamily {
  key: string;
  code: string;
  name: string;
}

/** [youtube id, title, kind]; kind is video | live | other (from tv.json). */
export type AlbumVideo = [id: string, title: string, kind: string];
/** [youtube id, track, album] from TheAudioDB / Wikidata. */
export type ArtistVideo = [id: string, track: string, album: string];

export interface ExploreAlbum {
  slug: string;
  /** Title. */
  t: string;
  /** Artist credit as written on the record. */
  by: string;
  /** Artist indexes. */
  a: number[];
  /** Original release year. */
  y: number | null;
  /** Date added, YYYY-MM-DD. */
  added: string | null;
  /** Genre names. */
  g: string[];
  /** Discogs styles. */
  s: string[];
  /** Labels. */
  l: string[];
  /** Country of release. */
  c: string | null;
  /** Genre family key (src/lib/genreFamilies.ts). */
  fam: string;
  /** Primary format. */
  fmt: string | null;
  /** Vinyl colour as Discogs writes it, or null. */
  vc: string | null;
  /** Last.fm listeners. */
  lis: number;
  /** Sleeve palette from album-colors.json: flood, ink on flood, dark ground, hue 0–1, vividness. */
  fl: string;
  ink: string;
  gr: string;
  h: number;
  viv: number;
  /** Up to five videos, music videos first. */
  v: AlbumVideo[];
}

export interface ExploreArtist {
  slug: string;
  name: string;
  /** Biography, cut to about 320 characters. */
  bio: string;
  genre: string | null;
  mood: string | null;
  /** Country code and place, from TheAudioDB. */
  cc: string | null;
  from: string | null;
  born: number | null;
  formed: number | null;
  died: number | null;
  /** The artist page's hero fanart file (`{slug}-fanart0N.jpg`, 1280×720), the only one on R2; null when none. */
  fanart: string | null;
  /** The fanart chosen as the artist photo, when it is one (else the photo is `{slug}-hi-res.jpg`). */
  photo: string | null;
  /**
   * The avatar's square in the photo (and so in its `medium` size) as fractions
   * [left, top, width, height], cut round the faces like the site's avatars; null = the middle.
   */
  crop: [number, number, number, number] | null;
  /** Focal point [x, y] (0–1) in the fanart when there is one, else in the photo. */
  focus: [number, number] | null;
  /** Discogs member names. */
  members: string[];
  videos: ArtistVideo[];
  /** Album indexes. */
  records: number[];
}

/** [album index, role as Discogs writes it, kind] */
export type PersonCredit = [album: number, role: string, kind: CreditKind];

/** A musician in two or more collection bands, or someone credited on two or more artists' records. */
export interface ExplorePerson {
  /** Discogs artist id. */
  id: string;
  name: string;
  /** Discogs photo (remote), may be null. */
  thumb: string | null;
  /** Artist indexes of the bands they were in. */
  bands: number[];
  /** Their own artist index when they are in the collection themselves. */
  artist: number | null;
  credits: PersonCredit[];
}

export type LinkReason =
  /** Played in both bands. */
  | { type: 'bandmate'; who: string; person: number }
  /** `who` is a member of the artist `from` (Discogs members). */
  | { type: 'member'; who: string; from: number }
  /** The artist `from` was in the group `who` (Discogs groups). */
  | { type: 'group'; who: string; from: number }
  /** The same act under another name. */
  | { type: 'alias'; who: string; from: number }
  /** `guest` is credited on a track of `host`'s record. */
  | { type: 'guest'; album: number; track: string; host: number; guest: number }
  /** A collection artist credited on another artist's record. */
  | { type: 'credit'; who: string; person: number; album: number; role: string; kind: CreditKind }
  /** The same person credited on both artists' records. */
  | { type: 'shared-credit'; who: string; person: number; albums: [number, number]; roles: [string, string]; kinds: [CreditKind, CreditKind] };

export type LinkType = LinkReason['type'];

export interface ExploreLink {
  a: number;
  b: number;
  why: LinkReason[];
}

export interface ExploreData {
  v: 1;
  generated: string;
  families: ExploreFamily[];
  albums: ExploreAlbum[];
  artists: ExploreArtist[];
  people: ExplorePerson[];
  links: ExploreLink[];
  atlas: {
    /** Sleeve cell size in px, columns (and rows) per sheet, sheet count. */
    sleeve: number;
    cols: number;
    sheets: number;
    avatar: number;
    avatarCols: number;
    avatarRows: number;
  };
}
