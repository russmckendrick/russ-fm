import { useEffect, useState } from 'react';
import { getAlbumImageUrl, getArtistAvatarUrl, getArtistImageUrl, getImageUrl } from '@/lib/image-utils';
import { creditVerb } from './credits';
import type { ExploreAlbum, ExploreArtist, ExploreData, LinkReason } from './types';

/**
 * The /explore graph (public/explore/explore.json) with lookup tables built
 * once per tab. Shared by The Thread and The Galaxy.
 */
export interface Explore extends ExploreData {
  artistBySlug: Map<string, number>;
  albumBySlug: Map<string, number>;
  /** Artist index -> every linked artist and why. */
  neighbours: { other: number; why: LinkReason[] }[][];
  byLabel: Map<string, number[]>;
  byStyle: Map<string, number[]>;
  byYear: Map<number, number[]>;
  byColour: Map<string, number[]>;
  /** Album index -> people credited on it (person index, role). */
  creditsOn: Map<number, { person: number; role: string }[]>;
}

export const EXPLORE_DATA_URL = '/explore/explore.json';

let pending: Promise<Explore> | null = null;
let loaded: Explore | null = null;

export function loadExplore(): Promise<Explore> {
  if (!pending) {
    pending = fetch(EXPLORE_DATA_URL)
      .then(res => {
        if (!res.ok) throw new Error(`explore.json: ${res.status}`);
        return res.json() as Promise<ExploreData>;
      })
      .then(data => (loaded = indexExplore(data)))
      .catch(err => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

/** The graph, loading it on first use. */
export function useExplore(): { data: Explore | null; error: boolean; retry: () => void } {
  const [data, setData] = useState<Explore | null>(loaded);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (loaded) return;
    let live = true;
    loadExplore()
      .then(d => live && setData(d))
      .catch(err => {
        console.error('Error loading explore data:', err);
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  return { data, error, retry: () => (setError(false), setAttempt(n => n + 1)) };
}

function groupBy<K>(n: number, keys: (i: number) => K[]): Map<K, number[]> {
  const m = new Map<K, number[]>();
  for (let i = 0; i < n; i++) {
    for (const k of keys(i)) {
      const list = m.get(k);
      if (list) list.push(i);
      else m.set(k, [i]);
    }
  }
  return m;
}

export function indexExplore(data: ExploreData): Explore {
  const neighbours: Explore['neighbours'] = data.artists.map(() => []);
  for (const l of data.links) {
    neighbours[l.a].push({ other: l.b, why: l.why });
    neighbours[l.b].push({ other: l.a, why: l.why });
  }
  const creditsOn = new Map<number, { person: number; role: string }[]>();
  data.people.forEach((p, person) => {
    for (const [album, role] of p.credits) {
      const list = creditsOn.get(album);
      if (list) list.push({ person, role });
      else creditsOn.set(album, [{ person, role }]);
    }
  });
  const A = data.albums;
  return {
    ...data,
    artistBySlug: new Map(data.artists.map((a, i) => [a.slug, i])),
    albumBySlug: new Map(A.map((a, i) => [a.slug, i])),
    neighbours,
    byLabel: groupBy(A.length, i => A[i].l),
    byStyle: groupBy(A.length, i => A[i].s),
    byYear: groupBy(A.length, i => (A[i].y ? [A[i].y!] : [])),
    byColour: groupBy(A.length, i => (A[i].vc ? [A[i].vc!] : [])),
    creditsOn,
  };
}

// ---- images and video -----------------------------------------------------------

export const sleeveUrl = (album: ExploreAlbum, size: 'medium' | 'hi-res' = 'medium') => getAlbumImageUrl(album.slug, size);

/** The artist photo (the fanart chosen as it, else the hi-res); medium and avatar follow it. */
export function artistPhotoUrl(artist: ExploreArtist, size: 'medium' | 'hi-res' | 'avatar' = 'medium'): string {
  if (size === 'avatar') return getArtistAvatarUrl(artist.slug);
  if (size === 'hi-res' && artist.photo) return getImageUrl(`artist/${artist.slug}/${artist.photo}`);
  return getArtistImageUrl(artist.slug, size);
}

/** The 1280×720 hero fanart, or null when the artist has none. */
export const fanartUrl = (artist: ExploreArtist) => (artist.fanart ? getImageUrl(`artist/${artist.slug}/${artist.fanart}`) : null);

/** A sleeve atlas sheet and the album's cell in it (pixels and UVs, v from the top). */
export function sleeveCell(d: ExploreData, i: number) {
  const { cols, sleeve } = d.atlas;
  const per = cols * cols;
  const n = i % per;
  return { sheet: Math.floor(i / per), x: (n % cols) * sleeve, y: Math.floor(n / cols) * sleeve, size: sleeve, u: (n % cols) / cols, v: Math.floor(n / cols) / cols, w: 1 / cols };
}
export const sleeveSheetUrl = (sheet: number) => `/explore/sleeves-${sheet}.webp`;

export function avatarCell(d: ExploreData, i: number) {
  const { avatarCols: cols, avatarRows: rows, avatar: size } = d.atlas;
  return { x: (i % cols) * size, y: Math.floor(i / cols) * size, size, u: (i % cols) / cols, v: Math.floor(i / cols) / rows, w: 1 / cols, h: 1 / rows };
}
export const AVATAR_SHEET_URL = '/explore/avatars.webp';

export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** A chrome-free YouTube embed; muted and looping unless told otherwise. */
export function ytEmbed(id: string, { start = 0, mute = true, loop = true } = {}): string {
  const q = new URLSearchParams({
    autoplay: '1',
    mute: mute ? '1' : '0',
    controls: mute ? '0' : '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    ...(loop ? { loop: '1', playlist: id } : {}),
    ...(start ? { start: String(start) } : {}),
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${q}`;
}

// ---- why two artists connect ----------------------------------------------------

/** How strongly a reason ties two artists, for ordering ways out (higher first). */
export function reasonWeight(why: LinkReason): number {
  switch (why.type) {
    case 'bandmate': return 6;
    case 'member':
    case 'group': return 5;
    case 'credit': return 4.5;
    case 'guest': return 4;
    case 'shared-credit': return why.kinds.includes('produced') || why.kinds.includes('played') ? 3.5 : 2.5;
    case 'alias': return 2;
  }
}

/** The strongest reason first. */
export const sortReasons = (why: LinkReason[]) => [...why].sort((x, y) => reasonWeight(y) - reasonWeight(x));

/** One plain sentence for why `from` connects to `to`. */
export function describeLink(d: ExploreData, why: LinkReason, from: number, to: number): string {
  const A = (i: number) => d.artists[i].name;
  const T = (i: number) => d.albums[i].t;
  switch (why.type) {
    case 'bandmate':
      return `${why.who} played in both ${A(from)} and ${A(to)}`;
    case 'member':
      return `${why.who} was a member of ${A(why.from)}`;
    case 'group':
      return `${A(why.from)} was in ${why.who}`;
    case 'alias':
      return `${A(from)} and ${A(to)} are the same act under another name`;
    case 'guest':
      return `${A(why.guest)} is on "${why.track}" from ${T(why.album)}`;
    case 'credit':
      return `${why.who} ${creditVerb(why.kind, why.role)} ${T(why.album)}`;
    case 'shared-credit': {
      // Name the records in the order of the hop: from's record, then to's.
      const fromFirst = d.albums[why.albums[0]].a.includes(from);
      const [x, y] = fromFirst ? [0, 1] : [1, 0];
      const vx = creditVerb(why.kinds[x], why.roles[x]);
      const vy = creditVerb(why.kinds[y], why.roles[y]);
      return vx === vy
        ? `${why.who} ${vx} ${T(why.albums[x])} and ${T(why.albums[y])}`
        : `${why.who} ${vx} ${T(why.albums[x])} and ${vy} ${T(why.albums[y])}`;
    }
  }
}

/** A short label for the kind of link: "Shared member", "Same producer"… */
export function reasonLabel(why: LinkReason): string {
  switch (why.type) {
    case 'bandmate': return 'Shared member';
    case 'member': return 'Member';
    case 'group': return 'Was in';
    case 'alias': return 'Also known as';
    case 'guest': return 'Guest spot';
    case 'credit': return 'Credited on';
    case 'shared-credit':
      return ({ produced: 'Same producer', played: 'Same player', wrote: 'Same writer', engineered: 'Same engineer', designed: 'Same designer' } as const)[why.kinds[0]];
  }
}
