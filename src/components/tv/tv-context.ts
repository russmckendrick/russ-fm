import { createContext, useContext } from 'react';
import type { TvChannel, TvItem } from '@/lib/tv';
import type { TvPlayer } from './useTvPlayer';

/**
 * The TV, kept above the routes so it keeps playing while you browse. On the
 * TV page the picture sits behind the room's glass (the page registers its
 * screen with `setSlot`); anywhere else it floats bottom left.
 */
export interface TvState {
  /** Switched on (a channel has been tuned and not closed). */
  active: boolean;
  channel: TvChannel | null;
  index: number;
  item: TvItem | null;
  /** Seconds into the item when it was loaded (tuning in mid-programme). */
  offset: number;
  player: TvPlayer;
  fullscreen: boolean;
  /**
   * Tune to a channel: to `videoId` from its start when the channel has it (a
   * shared link), else to whatever it is airing now. No-op when that is
   * already what is on; when `videoId` is playing on another channel, it moves
   * to this channel and keeps playing without a reload.
   */
  tune: (channel: TvChannel, videoId?: string | null) => void;
  go: (index: number) => void;
  next: () => void;
  prev: () => void;
  /** Switch off: pause and drop the floating player. */
  close: () => void;
  toggleFullscreen: () => void;
  /** The TV page's screen element, or null when the page is not showing. */
  setSlot: (el: HTMLElement | null) => void;
  /**
   * Videos found dead this visit: YouTube refused them in the player, or their
   * thumbnail is missing (deleted and private videos). Lists hide them and
   * next/previous skip them; tv.json leaves out the ones the scrapper found.
   */
  dead: ReadonlySet<string>;
  markDead: (id: string) => void;
}

/**
 * Whether a loaded YouTube thumbnail is the grey placeholder YouTube serves for
 * a video that is gone. It comes with a 404 status, but browsers still draw it
 * (so `onError` never fires), and it is 120 px wide where real ones are 320+.
 */
export function isMissingThumb(img: HTMLImageElement): boolean {
  return img.naturalWidth > 0 && img.naturalWidth <= 120;
}

export const TvContext = createContext<TvState | null>(null);

export function useTv(): TvState {
  const tv = useContext(TvContext);
  if (!tv) throw new Error('useTv must be used inside TvProvider');
  return tv;
}
