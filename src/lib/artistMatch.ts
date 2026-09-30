// Relative, not @/: src/lib/tv.ts imports this, and the OG script runs that under plain tsx.
import { sanitizeFolderName } from './sigurRosNormalizer';

/** The parts of an album that say who is on it. */
export interface ArtistCredits {
  uri_artist: string;
  release_artist: string;
  artists?: Array<{ name: string; uri_artist: string }>;
  members?: Array<{ name: string; uri_artist: string | null }>;
}

export interface ArtistMatcher {
  /** An artist URI (`/artist/<slug>/`) that is this artist. */
  matches: (uri: string | null | undefined) => boolean;
  /**
   * The album is this artist's: the headliner, one of the credited artists,
   * or (for a player's page) one of the band's line-up.
   */
  credits: (album: ArtistCredits) => boolean;
  /** The artist's name as the album credits it, if it does. */
  nameOn: (album: ArtistCredits) => string | null;
}

/** Match albums to the artist at `/artist/<artistPath>/`, as the artist page does. */
export function artistMatcher(artistPath: string): ArtistMatcher {
  const decoded = decodeURIComponent(artistPath);
  const target = `/artist/${decoded}/`;

  const matches = (uri: string | null | undefined) => {
    if (!uri) return false;
    if (uri === target) return true;
    return decoded === sanitizeFolderName(uri.replace('/artist/', '').replace('/', ''));
  };

  const credits = (album: ArtistCredits) =>
    matches(album.uri_artist) ||
    !!album.artists?.some(a => matches(a.uri_artist)) ||
    !!album.members?.some(m => matches(m.uri_artist)) ||
    decoded === sanitizeFolderName(album.release_artist);

  const nameOn = (album: ArtistCredits) =>
    album.artists?.find(a => matches(a.uri_artist))?.name ??
    album.members?.find(m => matches(m.uri_artist))?.name ??
    (credits(album) ? album.release_artist : null);

  return { matches, credits, nameOn };
}
