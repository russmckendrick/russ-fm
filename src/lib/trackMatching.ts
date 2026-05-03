/**
 * Match Discogs tracklist entries against Spotify track IDs by normalised name.
 *
 * The Discogs tracklist drives the on-page render order, but Spotify gives us
 * the only stable per-track identifier. We don't try anything clever — same
 * normalised title is good enough for ~all non-classical albums.
 */

interface SpotifyTrack {
  id?: string;
  name?: string;
}

/**
 * Lower-case, strip punctuation, collapse whitespace.
 * "Don't Stop (2007 Remaster)" → "dont stop 2007 remaster"
 */
export function normaliseTrackTitle(title: string | undefined | null): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[‘’“”]/g, '') // smart quotes
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a lookup from normalised track title → Spotify track ID.
 * Returns an empty Map when the input is missing.
 */
export function buildSpotifyTrackIndex(tracks: SpotifyTrack[] | undefined | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!tracks) return out;
  for (const t of tracks) {
    if (!t.id || !t.name) continue;
    const key = normaliseTrackTitle(t.name);
    if (!key || out.has(key)) continue; // first occurrence wins
    out.set(key, t.id);
  }
  return out;
}
