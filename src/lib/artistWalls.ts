import geometry from '@/config/artist-walls.json';
import { TV_ROOMS, tvRoomFor, type TvRoomId } from './tv';

/**
 * The artist page's fly-poster walls: one per /tv room, so an artist's poster
 * goes up where their records play. Codex photos with the poster printed
 * chroma-key green and cut out; scripts/process-artist-walls.py writes the
 * poster's box into src/config/artist-walls.json, and a shade layer from the
 * green (the wall's light and creases) for the poster.
 */
export interface ArtistWall {
  id: TvRoomId;
  name: string;
  /** Width over height of the photo. */
  aspect: number;
  /** The poster, in % of the photo. */
  poster: { left: number; top: number; width: number; height: number };
}

const GEOMETRY = geometry as Record<string, Pick<ArtistWall, 'aspect' | 'poster'>>;

export const ARTIST_WALLS: ArtistWall[] = TV_ROOMS.filter(r => GEOMETRY[r.id]).map(r => ({ id: r.id, name: r.name, ...GEOMETRY[r.id] }));

/**
 * An artist's wall: the room most of their records play in (tvRoomFor, as the
 * album page's listening room), ties going to the newest record's. Pass the
 * records newest first. The living room (`shelves`) when they have none.
 */
export function artistWallFor(records: Array<{ genre_names?: string[] | null; styles?: string[] | null }>): ArtistWall {
  const counts = new Map<TvRoomId, number>();
  for (const r of records) {
    const id = tvRoomFor(r.genre_names ?? [], r.styles ?? []);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  // Map keeps the newest record's room first, and the sort is stable, so ties go to it.
  const id = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  return ARTIST_WALLS.find(w => w.id === id) ?? ARTIST_WALLS.find(w => w.id === 'shelves') ?? ARTIST_WALLS[0];
}
