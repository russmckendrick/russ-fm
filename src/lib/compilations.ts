import type { Album } from '@/types/album';

/**
 * Compilations: records credited to Discogs' "Various" placeholder.
 *
 * Who plays on them comes from compilations.json, written by the scrapper
 * beside collection.json from each track's own artist credit
 * (scrapper/src/output/compilations.rs). Which shelf a compilation sits on is
 * worked out here from its title, genres and styles.
 */

/** Slug of the Various Artists page (/artist/various). */
export const VARIOUS_SLUG = 'various';

/** The name it is shown under: Discogs calls the placeholder plain "Various". */
export const VARIOUS_NAME = 'Various Artists';

export function isVarious(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase();
  return n === 'various' || n === 'various artists';
}

/** Credited to Various, alone or alongside a named artist ("Max Richter & Various"). */
export function isCompilation(album: { release_artist: string; artists?: Array<{ name: string }> }): boolean {
  return isVarious(album.release_artist) || (album.artists ?? []).some(a => isVarious(a.name));
}

export interface CompilationsData {
  /** Per compilation (uri_release): artists credited on its tracks, and pages by credited name. */
  releases: Record<string, { artists: number; links: Record<string, string> }>;
  /** Per artist page (uri_artist): the compilations they play on and their tracks there. */
  artists: Record<string, { name: string; on: Array<{ release: string; tracks: string[] }> }>;
  /** The most credited artists without a page, most compilations first. */
  others: Array<{ name: string; releases: number }>;
  /** How many credited artists have no page. */
  others_count: number;
}

let compilationsPromise: Promise<CompilationsData> | null = null;

export function loadCompilations(): Promise<CompilationsData> {
  if (!compilationsPromise) {
    compilationsPromise = fetch('/compilations.json')
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load compilations.json: ${res.status}`);
        return res.json() as Promise<CompilationsData>;
      })
      .catch(err => {
        compilationsPromise = null;
        throw err;
      });
  }
  return compilationsPromise;
}

export type Shelf = 'soundtrack' | 'anthology' | 'series' | 'tribute';

export const SHELVES: Array<{ key: Shelf; label: string; one: string; blurb: string }> = [
  { key: 'soundtrack', label: 'Soundtracks', one: 'Soundtrack', blurb: 'Films, TV and the odd video game.' },
  { key: 'anthology', label: 'Anthologies', one: 'Anthology', blurb: 'Label samplers, scene round-ups and benefit albums.' },
  { key: 'series', label: 'Series', one: 'Series', blurb: 'Now That’s What I Call…, the Anthems run and the other numbered and decade sets.' },
  { key: 'tribute', label: 'Tributes', one: 'Tribute', blurb: 'One artist’s songs, played by everyone else.' },
];

const TRIBUTE = /\b(songs of|tribute to|a tribute|reimagin\w*|many faces of|plays the|does the|covers)\b/i;
const SERIES = /^\s*now\b|\bnow that'?s what|\bcollected$|\banthems?\b|\bhistory of rock\b|\bindie top 20\b/i;
const SOUNDTRACK_TITLE = /soundtrack|motion picture|music from\b|original cast|\bost\b/i;
const NUMBERED = /\bvol(ume)?\.? ?(\d+|[ivx]+|one|two|three)\b|\bbest of\b/i;

/**
 * Which shelf a compilation sits on, from its title first: a tribute, then a
 * named series (Discogs files some Now albums under Soundtrack), then a
 * soundtrack title, then a numbered or best-of set, then Soundtrack / Stage &
 * Screen among its genres and styles. Everything else is an anthology.
 */
export function shelfOf(album: Pick<Album, 'release_name' | 'genre_names' | 'styles'>): Shelf {
  const title = album.release_name.trim();
  if (TRIBUTE.test(title)) return 'tribute';
  if (SERIES.test(title)) return 'series';
  if (SOUNDTRACK_TITLE.test(title)) return 'soundtrack';
  if (NUMBERED.test(title)) return 'series';
  const tags = [...(album.genre_names ?? []), ...(album.styles ?? [])];
  if (tags.some(t => t === 'Soundtrack' || t === 'Stage & Screen')) return 'soundtrack';
  return 'anthology';
}

/** The artist page for a track credit on a compilation, if it has one. */
export function trackArtistPage(data: CompilationsData | null, uriRelease: string, name: string): string | null {
  return data?.releases[uriRelease]?.links[name] ?? null;
}

/** Artist pages credited on a compilation (by credited name), without repeats. */
export function linkedArtists(data: CompilationsData | null, uriRelease: string): string[] {
  return [...new Set(Object.values(data?.releases[uriRelease]?.links ?? {}))];
}
