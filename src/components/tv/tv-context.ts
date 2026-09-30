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
   * already what is on.
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
}

export const TvContext = createContext<TvState | null>(null);

export function useTv(): TvState {
  const tv = useContext(TvContext);
  if (!tv) throw new Error('useTv must be used inside TvProvider');
  return tv;
}
