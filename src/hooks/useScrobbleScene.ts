import { useCallback, useEffect, useRef, useState } from 'react';

/** What AlbumScrobbleButton reports while it works through an album. */
export interface ScrobbleProgress {
  status: 'running' | 'done' | 'failed';
  /** Tracks ticked off so far (the one playing is `done`, zero-based). */
  done: number;
  total: number;
  /** Tracks Last.fm accepted, once `status` is `done`. */
  successful?: number;
}

/**
 * The hero record's choreography: `out` slides the disc clear of the sleeve,
 * `lift` brings it back over the cover, `play` hovers while the tracks tick
 * off, `done` holds the finished ring, and `back` slides it home again.
 */
export type ScenePhase = 'idle' | 'out' | 'lift' | 'play' | 'done' | 'back';

/** The sleeve sticker: "Added", then "Scrobbled", then "Added" fading back. */
export type StampState = 'added' | 'scrobbled' | 'returning' | 'returned';

export interface ScrobbleScene {
  phase: ScenePhase;
  done: number;
  total: number;
  successful: number;
  stamp: StampState;
  /** ISO time of the last finished scrobble, for the "Scrobbled" sticker. */
  stampedAt: string | null;
}

/** Time from pressing Scrobble until the disc is hovering and the first track ticks. */
export const SCENE_LEAD_IN_MS = 1450;
/** How long each track holds in the ring before the next one lights. */
export const SCENE_TRACK_MS = 460;

const LIFT_AT_MS = 560;
const DONE_HOLD_MS = 1500;
const BACK_MS = 650;
const RESTAMP_AFTER_MS = 10000;
const RESTAMP_FADE_MS = 1000;

const IDLE: ScrobbleScene = { phase: 'idle', done: 0, total: 0, successful: 0, stamp: 'added', stampedAt: null };

/**
 * Drives the album hero's scrobble scene from AlbumScrobbleButton's progress
 * reports. Pass the album path as `resetKey` so a new album starts clean.
 */
export function useScrobbleScene(resetKey?: string) {
  const [scene, setScene] = useState<ScrobbleScene>(IDLE);
  const timers = useRef<number[]>([]);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const at = useCallback((ms: number, patch: Partial<ScrobbleScene>) => {
    timers.current.push(window.setTimeout(() => setScene(s => ({ ...s, ...patch })), ms));
  }, []);

  useEffect(() => {
    clear();
    setScene(IDLE);
  }, [resetKey, clear]);

  useEffect(() => clear, [clear]);

  const onProgress = useCallback(
    (p: ScrobbleProgress) => {
      if (p.status === 'running') {
        if (p.done === 0) {
          clear();
          setScene(s => ({ ...s, phase: 'out', done: 0, total: p.total }));
          at(LIFT_AT_MS, { phase: 'lift' });
          at(SCENE_LEAD_IN_MS, { phase: 'play' });
        } else {
          setScene(s => ({ ...s, done: p.done, total: p.total }));
        }
        return;
      }

      clear();
      if (p.status === 'failed') {
        setScene(s => ({ ...s, phase: s.phase === 'idle' ? 'idle' : 'back' }));
        at(BACK_MS, { phase: 'idle', done: 0 });
        return;
      }

      // Done: hold the full ring, slide home, then let "Added" fade back in.
      setScene(s => ({
        ...s,
        phase: 'done',
        done: p.total,
        total: p.total,
        successful: p.successful ?? p.total,
        stamp: 'scrobbled',
        stampedAt: new Date().toISOString(),
      }));
      at(DONE_HOLD_MS, { phase: 'back' });
      at(DONE_HOLD_MS + BACK_MS, { phase: 'idle' });
      at(DONE_HOLD_MS + BACK_MS + RESTAMP_AFTER_MS, { stamp: 'returning' });
      at(DONE_HOLD_MS + BACK_MS + RESTAMP_AFTER_MS + RESTAMP_FADE_MS, { stamp: 'returned' });
    },
    [at, clear],
  );

  return { scene, onProgress };
}
