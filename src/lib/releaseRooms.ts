import geometry from '@/config/release-rooms.json';
import { TV_ROOMS, tvRoomFor, type TvRoomId } from './tv';

/**
 * The album page's listening rooms: one per /tv room, so a record plays in the
 * same room as its TV channel. Codex photos with the sleeve's stand and the
 * record on the turntable cut out; scripts/process-release-rooms.py writes the
 * geometry into src/config/release-rooms.json. The real sleeve shows through
 * the stand, and a spinning record in the pressing's colour shows through the
 * platter, under the tonearm.
 */
export interface ReleaseRoom {
  id: TvRoomId;
  name: string;
  /** The stand's board, in % of the photo. */
  sleeve: { left: number; top: number; width: number; height: number };
  /**
   * The record: the spindle (x, y, % of the photo), the centre of its outline
   * (fx, fy; in perspective it sits off the spindle), the outline's half-axes
   * (rx in % of width, ry in % of height), how far the spun disc must reach to
   * fill the cut-out and the label's radius, both in half-widths.
   */
  record: { x: number; y: number; fx: number; fy: number; rx: number; ry: number; cover: number; hole: number };
  /** How brightly the room lights the record (a brightness filter, by eye from the photo). */
  light: number;
}

/** Every room photo is 3:2. */
export const RELEASE_ROOM_ASPECT = 1.5;

/** Rooms dark enough that a full-brightness record glows; by eye. */
const LIGHT: Partial<Record<TvRoomId, number>> = {};

const GEOMETRY = geometry as Record<string, Pick<ReleaseRoom, 'sleeve' | 'record'>>;

export const RELEASE_ROOMS: ReleaseRoom[] = TV_ROOMS.filter(r => GEOMETRY[r.id]).map(r => ({
  id: r.id,
  name: r.name,
  ...GEOMETRY[r.id],
  light: LIGHT[r.id] ?? 1,
}));

/** The room a record plays in: its TV channel's (the living room when it has none). */
export function releaseRoomFor(album: { genre_names?: string[] | null; styles?: string[] | null }): ReleaseRoom {
  const id = tvRoomFor(album.genre_names ?? [], album.styles ?? []);
  return RELEASE_ROOMS.find(r => r.id === id) ?? RELEASE_ROOMS.find(r => r.id === 'shelves') ?? RELEASE_ROOMS[0];
}
