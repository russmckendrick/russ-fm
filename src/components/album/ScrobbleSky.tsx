import { useEffect, useRef, useState } from 'react';
import type { CloudHandle, CloudSky } from '@/lib/scrobbleClouds';
import type { ScrobbleScene } from '@/hooks/useScrobbleScene';

export interface SkyTrack {
  position?: string;
  name?: string;
}

interface ScrobbleSkyProps {
  /** The album hero's scrobble, from useScrobbleScene. */
  scene: ScrobbleScene;
  /** The tracks being scrobbled, in order (scrobbleableRows). */
  tracks: SkyTrack[];
  /** The room's box, and the record's centre in it, in px. */
  width: number;
  height: number;
  origin: { x: number; y: number };
  /** The bottom of the header over the room: clouds are gone before they reach it. */
  ceiling: number;
  /** The room's colour, which lights the clouds. */
  tint: string;
}

const MAX_TITLE = 42;
const clip = (s: string) => (s.length > MAX_TITLE ? `${s.slice(0, MAX_TITLE - 1).trimEnd()}…` : s);

/**
 * The album room's scrobble, drawn as clouds (src/lib/scrobbleClouds.ts): each
 * track lifts off the record as it comes up, takes its tick once the count
 * passes it, and drifts away; when Last.fm answers, a bigger cloud carries the
 * result. A failed scrobble evaporates whatever is in the air. Three.js loads
 * on the first scrobble. Nothing draws with reduced motion (the band's readout
 * says the same) or without WebGL.
 */
export function ScrobbleSky({ scene, tracks, width, height, origin, ceiling, tint }: ScrobbleSkyProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sky, setSky] = useState<CloudSky | null>(null);
  const [wanted, setWanted] = useState(false);
  const run = useRef<{ lifted: CloudHandle[]; confirmed: boolean }>({ lifted: [], confirmed: false });
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!wanted && !reduced && scene.phase !== 'idle') setWanted(true);

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    let made: CloudSky | null = null;
    import('@/lib/scrobbleClouds')
      .then(({ createCloudSky }) => {
        if (!live || !canvas.current) return;
        made = createCloudSky(canvas.current);
        setSky(made);
      })
      .catch(() => {});
    return () => {
      live = false;
      made?.dispose();
    };
  }, [wanted]);

  useEffect(() => {
    sky?.resize(width, height);
  }, [sky, width, height]);

  // On phones the room frames just the stand, so the record can be off to the side: keep the clouds in view.
  const ox = Math.min(Math.max(origin.x, width * 0.2), width * 0.8);
  const oy = Math.min(Math.max(origin.y, height * 0.3), height * 0.85);
  useEffect(() => {
    sky?.setOrigin(ox, oy);
  }, [sky, ox, oy]);

  useEffect(() => {
    sky?.setCeiling(ceiling);
  }, [sky, ceiling]);

  useEffect(() => {
    sky?.setTint(tint);
  }, [sky, tint]);

  // Follow the scene: a cloud for every track reached, a tick for every one passed.
  const { phase, done, total, successful } = scene;
  useEffect(() => {
    if (!sky) return;
    const r = run.current;
    const running = phase === 'out' || phase === 'lift' || phase === 'play';
    // A new run once the last one has finished (or failed).
    if (running && done === 0 && r.confirmed) {
      run.current = { lifted: [], confirmed: false };
    }
    const now = run.current;
    if (running) {
      while (now.lifted.length <= done && now.lifted.length < tracks.length) {
        const track = tracks[now.lifted.length];
        now.lifted.push(sky.lift({ title: clip(track.name?.trim() || 'Untitled'), kicker: track.position?.trim() || undefined }));
      }
      now.lifted.slice(0, done).forEach(c => c.tick());
      return;
    }
    if (phase === 'done' && !now.confirmed) {
      now.confirmed = true;
      now.lifted.forEach(c => c.tick());
      sky.confirm({
        title: successful === total ? `Scrobbled ${total} tracks` : `Scrobbled ${successful} of ${total}`,
        sub: 'TO LAST.FM · JUST NOW',
      });
      return;
    }
    // Back without a result: the scrobble failed.
    if (phase === 'back' && !now.confirmed && now.lifted.length) {
      sky.evaporate();
      run.current = { lifted: [], confirmed: true };
    }
  }, [sky, phase, done, total, successful, tracks]);

  if (!wanted) return null;
  return <canvas ref={canvas} aria-hidden className="release-room-sky" style={{ width, height }} />;
}
