/**
 * Build the track payload for a Last.fm album scrobble.
 *
 * Two kinds of tracklist row must never be sent:
 *
 * - **Section headers.** Discogs marks sides, discs and box set albums with a position-less
 *   row ("Side :/", "Life In A Day"). They render as part of the tracklist but are not songs,
 *   so scrobbling them posts junk plays.
 * - **Suite rows** (`type: "index"`, e.g. "2112"). The suite is scrobbled as its movements,
 *   which follow it, each titled "Suite: Movement" ("2112: Overture") so a play reads as part
 *   of the piece. A "Medley" is a run of separate songs, so those keep their own titles.
 * - **Rows with no title**, which Last.fm has nothing to match against.
 *
 * Per-track artists are carried through for compilations, where the release artist is
 * "Various" and each track is credited separately. Tracks left without one are still
 * returned: the worker resolves them against the album artist and drops the ones that end up
 * as a placeholder, so the caller can report exactly what was skipped and why.
 */
export interface ScrobbleTrackSource {
  name?: string;
  position?: string;
  /** "heading" or "index" (a suite); plain tracks have none. */
  type?: string;
  /** The suite a movement belongs to. */
  parent?: string;
  artists?: Array<{ name?: string }>;
}

export interface ScrobbleTrackPayload {
  title: string;
  artist?: string;
}

/** The tracklist rows that get scrobbled, in order (the same rows toScrobbleTracks sends). */
export function scrobbleableRows<T extends ScrobbleTrackSource>(tracks: T[]): T[] {
  // Only treat position-less rows as headers when the tracklist actually uses positions.
  // The Spotify/Last.fm fallbacks in getTracks() carry no positions at all, and every row
  // there is a real track.
  const hasPositions = tracks.some(track => !!track.position?.trim());

  return tracks.filter(track => {
    if (!track.name?.trim()) return false;
    if (track.type === 'heading' || track.type === 'index') return false;
    if (track.parent) return true;
    return hasPositions ? !!track.position?.trim() : true;
  });
}

/** The title Last.fm gets: a suite's movements are prefixed with the suite. */
export function scrobbleTitle(track: ScrobbleTrackSource): string {
  const name = track.name!.trim();
  const parent = track.parent?.trim();
  return parent && !/^medley$/i.test(parent) ? `${parent}: ${name}` : name;
}

export function toScrobbleTracks(tracks: ScrobbleTrackSource[]): ScrobbleTrackPayload[] {
  return scrobbleableRows(tracks)
    .map(track => ({
      title: scrobbleTitle(track),
      artist: track.artists?.[0]?.name?.trim() || undefined,
    }));
}
