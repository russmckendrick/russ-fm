/**
 * Get The Galaxy's layout: from localStorage when this build of the data has
 * been laid out before, else from the Web Worker (or the main thread, where
 * workers are unavailable), then cached.
 */
import { layoutGalaxy } from './galaxyForce';
import { forceJob, layoutCacheKey, type GalaxyPrep } from './galaxyLayout';
import type { ExploreData } from './types';

export function readCachedLayout(key: string, n: number): Float32Array | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const arr = JSON.parse(raw) as number[];
    return Array.isArray(arr) && arr.length === n * 3 ? Float32Array.from(arr) : null;
  } catch {
    return null;
  }
}

function writeCachedLayout(key: string, positions: Float32Array) {
  try {
    // drop layouts from older builds of the data
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('russfm:galaxy-layout:') && k !== key) localStorage.removeItem(k);
    }
    localStorage.setItem(key, JSON.stringify(Array.from(positions, v => Math.round(v * 10) / 10)));
  } catch {
    // storage full or blocked: lay out again next time
  }
}

/** Resolves with x, y, z per artist. `cancel` stops the worker (e.g. on unmount). */
export function computeLayout(
  d: ExploreData,
  prep: GalaxyPrep,
  onProgress?: (done: number) => void,
): { promise: Promise<Float32Array>; cancel: () => void } {
  const key = layoutCacheKey(d);
  const cached = readCachedLayout(key, prep.n);
  if (cached) return { promise: Promise.resolve(cached), cancel: () => {} };
  const job = forceJob(prep);
  let worker: Worker | null = null;
  let cancelled = false;
  const promise = new Promise<Float32Array>((resolve, reject) => {
    const local = () => {
      if (cancelled) return;
      const P = layoutGalaxy(job);
      writeCachedLayout(key, P);
      resolve(P);
    };
    try {
      worker = new Worker(new URL('./galaxy.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ progress?: number; positions?: Float32Array }>) => {
        if (e.data.progress != null) onProgress?.(e.data.progress);
        if (e.data.positions) {
          worker?.terminate();
          worker = null;
          writeCachedLayout(key, e.data.positions);
          resolve(e.data.positions);
        }
      };
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
        try {
          local();
        } catch (err) {
          reject(err);
        }
      };
      worker.postMessage(job);
    } catch {
      local();
    }
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      worker?.terminate();
      worker = null;
    },
  };
}
