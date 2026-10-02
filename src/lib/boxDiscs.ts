import type { BoxsetContent } from '@/types/album';
import { entryDiscColours, type FormatDetail } from '@/lib/vinylLook';
import { basePosition, isSuiteRow } from '@/lib/tracklistRows';

/** A tracklist row as it appears in the box set's own Discogs tracklist. */
export interface BoxTrack {
  name: string;
  position?: string;
  duration_ms?: number;
  /** "heading" or "index" (a suite, which is a song, not an album). */
  type?: string;
  parent?: string;
  artists?: Array<{ name: string }>;
}

export interface BoxDisc {
  /** Title from the box's section header (or the linked album's name). */
  title: string;
  /** Linked album in the collection, when the disc has its own page. */
  member: BoxsetContent | null;
  tracks: BoxTrack[];
  /** Side letters in box order, e.g. ["E", "F"]. */
  sides: string[];
}

/**
 * Greek and Cyrillic letters Discogs sometimes has in place of their Latin twins
 * ("Master Οf Reality" with an Omicron).
 */
const LOOKALIKES: Record<string, string> = {
  'α': 'a', 'β': 'b', 'ε': 'e', 'η': 'h', 'ι': 'i', 'κ': 'k', 'μ': 'm', 'ν': 'n', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'y', 'χ': 'x', 'ζ': 'z',
  'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x',
};

/** Lower case, accents and look-alike letters folded, then letters and digits only. */
const norm = (s: string) =>
  s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[α-ωа-я]/g, c => LOOKALIKES[c] ?? c)
    .replace(/[^a-z0-9]/g, '');
const normNoParens = (s: string) => norm(s.replace(/\(.*?\)/g, ''));

/**
 * Split a box set's tracklist into its discs using the section headers
 * (position-less rows) and link each to a member album where one exists.
 * Headers with no linked member become generic discs that borrow the box art.
 */
export function buildBoxDiscs(tracklist: BoxTrack[], contents: BoxsetContent[]): BoxDisc[] {
  const sections: Array<{ header: string; tracks: BoxTrack[] }> = [];
  for (const t of tracklist) {
    if (isSuiteRow(t)) {
      if (sections.length) sections[sections.length - 1].tracks.push(t);
    } else if (!t.position?.trim()) {
      if (t.name?.trim()) sections.push({ header: t.name.trim(), tracks: [] });
    } else if (sections.length) {
      sections[sections.length - 1].tracks.push(t);
    }
  }

  const used = new Set<string>();
  const matchFor = (header: string): BoxsetContent | null => {
    const exact = contents.find(c => !used.has(c.uri_release) && norm(c.release_name) === norm(header));
    if (exact) return exact;
    const h = normNoParens(header);
    return (
      contents.find(c => {
        if (used.has(c.uri_release)) return false;
        const m = normNoParens(c.release_name);
        return h === m || h.startsWith(m) || m.startsWith(h);
      }) ?? null
    );
  };

  // Exact matches first so "Ziggy (2003 Mix)" can't steal the original's slot.
  const matches = new Map<number, BoxsetContent>();
  sections.forEach((s, i) => {
    const hit = contents.find(c => !used.has(c.uri_release) && norm(c.release_name) === norm(s.header));
    if (hit) {
      used.add(hit.uri_release);
      matches.set(i, hit);
    }
  });
  sections.forEach((s, i) => {
    if (matches.has(i)) return;
    const hit = matchFor(s.header);
    if (hit) {
      used.add(hit.uri_release);
      matches.set(i, hit);
    }
  });

  const discs: BoxDisc[] = sections
    .filter(s => s.tracks.length > 0)
    .map((s) => {
      const i = sections.indexOf(s);
      const member = matches.get(i) ?? null;
      const sides = [...new Set(s.tracks.map(t => basePosition(t).charAt(0)).filter(c => /[A-Z]/i.test(c)))];
      return { title: member ? member.release_name.trim() : s.header, member, tracks: s.tracks, sides };
    });

  // Linked members the box tracklist never mentioned still belong in the box.
  contents
    .filter(c => !used.has(c.uri_release))
    .forEach(c => discs.push({ title: c.release_name.trim(), member: c, tracks: [], sides: [] }));

  return discs;
}


/** A row of the box's own detail JSON tracklist (Discogs `title`, or `name` once mapped). */
export interface BoxTracklistRow {
  position?: string | null;
  title?: string;
  name?: string;
  type?: string;
  parent?: string;
}

/**
 * A side from a track position: "A1" → A, "AA3" → AA, "1-C2" → 1C and "LP-B4" → LPB (the
 * prefix is kept because some boxes restart the letters on every disc). CD and digital
 * positions ("1", "1-4", "CD1-1") have no side.
 */
function sideKey(position: string | null | undefined): string | null {
  const m = /^(?:([A-Z0-9]+)[-.])?([A-Z]{1,2})\d*$/i.exec((position ?? '').trim());
  return m ? `${m[1] ?? ''}${m[2]}`.toUpperCase() : null;
}

/**
 * The colour of each disc of every linked member of a box set, inherited from the box's
 * own pressing, keyed by the member's `uri_release`. Members link to the album's ordinary
 * Discogs release, so the colour of the disc in the box lives only on the box.
 *
 * Best effort. The box's vinyl entries (one per disc set, each `qty` discs, a single-sided
 * disc taking one side) are laid out in order and given the box's sides in the order the
 * tracklist uses them, so a member gets the discs that play its section's sides. When the
 * sides can't be trusted (letters restarting per album, or no letters at all) the member's
 * section takes the vinyl entry at the same place instead. Members with no coloured disc are
 * left out, so they stay black.
 */
export function boxMemberDiscs(
  tracklist: BoxTracklistRow[],
  formats: FormatDetail[] | null | undefined,
  contents: BoxsetContent[],
): Map<string, Array<string | null>> {
  const out = new Map<string, Array<string | null>>();
  const entries = (formats ?? []).filter(f => f.name === 'Vinyl');
  if (!entries.some(f => f.colour) || !contents.length) return out;

  // Sections of the box tracklist, with the sides each one plays.
  const sections: Array<{ header: string; keys: string[]; tracks: number }> = [];
  for (const row of tracklist) {
    const name = (row.title ?? row.name ?? '').trim();
    // A suite plays on its movements' side; they follow it and are counted there.
    if (isSuiteRow(row)) continue;
    if (!row.position?.trim()) {
      if (name) sections.push({ header: name, keys: [], tracks: 0 });
      continue;
    }
    const section = sections[sections.length - 1];
    if (!section) continue;
    section.tracks++;
    const key = sideKey(basePosition(row));
    if (key && !section.keys.includes(key)) section.keys.push(key);
  }
  // Headers with nothing under them ("CD1") are not albums.
  const albums = sections.filter(sec => sec.tracks > 0);

  // Sides are only trusted when no side comes back after the box has moved on (a section
  // may carry on the side before it, as bonus sub-sections do).
  const order: string[] = [];
  let sidesOk = true;
  for (const { keys } of albums) {
    for (const key of keys) {
      if (!order.includes(key)) order.push(key);
      else if (order[order.length - 1] !== key) sidesOk = false;
    }
  }
  const discs = entries.flatMap(entry => {
    const sides = entry.descriptions?.includes('Single Sided') ? 1 : 2;
    return entryDiscColours(entry).map(colour => ({ colour, sides }));
  });
  const discOfSide = new Map<string, number>();
  let next = 0;
  discs.forEach((disc, i) => {
    for (let s = 0; s < disc.sides && next < order.length; s++) discOfSide.set(order[next++], i);
  });

  // Match each member to a section, preferring sections with vinyl sides so "LP 1: Slayed?
  // (Brown Vinyl)" wins over the CD copy titled "Slayed?".
  const used = new Set<number>();
  const found = new Map<string, number>();
  const passes: Array<(h: string, m: string, keyed: boolean) => boolean> = [
    (h, m, keyed) => keyed && norm(h) === norm(m),
    (h, m, keyed) => keyed && fuzzy(h, m),
    // "Black Sabbath Vol 4" for a section titled "Vol. 4"; only where the sides say it is vinyl.
    (h, m, keyed) => keyed && normNoParens(h).length >= 4 && normNoParens(m).includes(normNoParens(h)),
    (h, m) => norm(h) === norm(m),
    (h, m) => fuzzy(h, m),
  ];
  for (const pass of passes) {
    for (const member of contents) {
      if (found.has(member.uri_release)) continue;
      const i = albums.findIndex((sec, k) => !used.has(k) && pass(sec.header, member.release_name, sec.keys.length > 0));
      if (i !== -1) {
        used.add(i);
        found.set(member.uri_release, i);
      }
    }
  }

  for (const [uri, i] of found) {
    const section = albums[i];
    let colours: Array<string | null> = [];
    if (sidesOk && section.keys.length) {
      const hit = [...new Set(section.keys.map(k => discOfSide.get(k)).filter((d): d is number => d !== undefined))];
      colours = hit.map(d => discs[d].colour);
    }
    if (!colours.length) {
      const entry = entries[i];
      if (entry) colours = entryDiscColours(entry);
    }
    if (colours.some(Boolean)) out.set(uri, colours);
  }
  return out;
}

/** A loose title match: one starts with the other, or the section's title contains the album's. */
function fuzzy(header: string, member: string): boolean {
  const h = normNoParens(header);
  const m = normNoParens(member);
  if (!h || !m) return false;
  return h === m || h.startsWith(m) || m.startsWith(h) || (m.length >= 4 && h.includes(m));
}
