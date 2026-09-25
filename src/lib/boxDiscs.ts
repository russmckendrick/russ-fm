import type { BoxsetContent } from '@/types/album';

/** A tracklist row as it appears in the box set's own Discogs tracklist. */
export interface BoxTrack {
  name: string;
  position?: string;
  duration_ms?: number;
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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const normNoParens = (s: string) => norm(s.replace(/\(.*?\)/g, ''));

/**
 * Split a box set's tracklist into its discs using the section headers
 * (position-less rows) and link each to a member album where one exists.
 * Headers with no linked member become generic discs that borrow the box art.
 */
export function buildBoxDiscs(tracklist: BoxTrack[], contents: BoxsetContent[]): BoxDisc[] {
  const sections: Array<{ header: string; tracks: BoxTrack[] }> = [];
  for (const t of tracklist) {
    if (!t.position?.trim()) {
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
      const sides = [...new Set(s.tracks.map(t => (t.position ?? '').charAt(0)).filter(c => /[A-Z]/i.test(c)))];
      return { title: member ? member.release_name.trim() : s.header, member, tracks: s.tracks, sides };
    });

  // Linked members the box tracklist never mentioned still belong in the box.
  contents
    .filter(c => !used.has(c.uri_release))
    .forEach(c => discs.push({ title: c.release_name.trim(), member: c, tracks: [], sides: [] }));

  return discs;
}

