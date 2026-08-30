/**
 * Build the track payload for a Last.fm album scrobble.
 *
 * Two kinds of tracklist row must never be sent:
 *
 * - **Section headers.** Discogs marks sides, discs and box set albums with a position-less
 *   row ("Side :/", "Life In A Day"). They render as part of the tracklist but are not songs,
 *   so scrobbling them posts junk plays.
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
  artists?: Array<{ name?: string }>;
}

export interface ScrobbleTrackPayload {
  title: string;
  artist?: string;
}

export function toScrobbleTracks(tracks: ScrobbleTrackSource[]): ScrobbleTrackPayload[] {
  // Only treat position-less rows as headers when the tracklist actually uses positions.
  // The Spotify/Last.fm fallbacks in getTracks() carry no positions at all, and every row
  // there is a real track.
  const hasPositions = tracks.some(track => !!track.position?.trim());

  return tracks
    .filter(track => {
      if (!track.name?.trim()) return false;
      return hasPositions ? !!track.position?.trim() : true;
    })
    .map(track => ({
      title: track.name!.trim(),
      artist: track.artists?.[0]?.name?.trim() || undefined,
    }));
}
