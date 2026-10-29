/**
 * Links into The Thread from the rest of the site. No imports, so album and
 * artist pages can link in without pulling the Thread's code into their chunk.
 */

export const THREAD_PATH = '/explore/thread';

/** The slug Explore keys an artist or record by: the last segment of its `/artist/…/` or `/album/…/` URI. */
const slugOf = (uri: string) => uri.replace(/\/+$/, '').split('/').pop() ?? '';

/** The Thread starting from an artist (`?seed=`). */
export const threadFromArtist = (uriArtist: string) => `${THREAD_PATH}?seed=${encodeURIComponent(slugOf(uriArtist))}`;

/** The Thread starting from a record (`?album=`). */
export const threadFromAlbum = (uriRelease: string) => `${THREAD_PATH}?album=${encodeURIComponent(slugOf(uriRelease))}`;
