import { useEffect, useState } from 'react';
import type { Album } from '@/types/album';
import { sanitizeJsonPath } from '@/lib/image-utils';

/**
 * Shared, cached loader for /collection.json.
 *
 * The file is several megabytes, so it is fetched and parsed once per tab.
 * Every page (and search) reads it through here. Once it has loaded,
 * `useCollection` hands the data back on the first render, so moving between
 * pages never shows an empty or loading state for data we already hold.
 */
let collectionPromise: Promise<Album[]> | null = null;
let collectionData: Album[] | null = null;

export function loadCollection(): Promise<Album[]> {
  if (!collectionPromise) {
    collectionPromise = fetch('/collection.json')
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load collection: ${res.status}`);
        return res.json() as Promise<Album[]>;
      })
      .then(data => {
        collectionData = data;
        return data;
      })
      .catch(err => {
        collectionPromise = null;
        throw err;
      });
  }
  return collectionPromise;
}

/** The parsed collection if it has already loaded, otherwise null. */
export function getLoadedCollection(): Album[] | null {
  return collectionData;
}

export function useCollection(): { albums: Album[]; loading: boolean; error: string | null } {
  const [albums, setAlbums] = useState<Album[]>(() => collectionData ?? []);
  const [loading, setLoading] = useState(() => collectionData === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (collectionData) return;
    let alive = true;
    loadCollection()
      .then(data => {
        if (alive) setAlbums(data);
      })
      .catch(err => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { albums, loading, error };
}

/**
 * Cached loader for the per-release and per-artist detail JSON files. Going
 * back to a page you have already seen (or one the home hero prefetched)
 * skips the network and the parse.
 */
const detailCache = new Map<string, Promise<unknown>>();

export function loadDetailJson<T = unknown>(path: string): Promise<T> {
  const url = sanitizeJsonPath(path);
  let pending = detailCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
        return res.json();
      })
      .catch(err => {
        detailCache.delete(url);
        throw err;
      });
    detailCache.set(url, pending);
  }
  return pending as Promise<T>;
}
