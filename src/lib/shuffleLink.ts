/**
 * Shuffle links (header, mobile menu, footer). Away from the Shuffle page they
 * go to /shuffle; on it (/shuffle or /random) they stay on the same URL and
 * ask the page to shuffle again through the navigation state.
 */

export const SHUFFLE_PATH = '/shuffle';

/** Both routes render the Shuffle page; /random is kept for old links. */
export const SHUFFLE_PATHS = [SHUFFLE_PATH, '/random'];

export interface ShuffleLinkState {
  reshuffle: true;
}

export function isShufflePath(pathname: string): boolean {
  return SHUFFLE_PATHS.includes(pathname.replace(/\/+$/, '') || '/');
}

/** `to` and `state` for a Shuffle `<Link>` rendered at `pathname`. */
export function shuffleLink(pathname: string): { to: string; state?: ShuffleLinkState } {
  return isShufflePath(pathname) ? { to: pathname, state: { reshuffle: true } } : { to: SHUFFLE_PATH };
}

export function isReshuffleState(state: unknown): state is ShuffleLinkState {
  return typeof state === 'object' && state !== null && (state as ShuffleLinkState).reshuffle === true;
}
