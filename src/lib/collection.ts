import { useEffect, useState } from 'react';
import type { Album } from '@/types/album';

/**
 * Shared, cached loader for /collection.json.
 *
 * Pages used to fetch the file independently; the player design moves between
 * pages quickly (crate flips, colour walls, box sets), so the parsed collection
 * is kept for the lifetime of the tab.
 */
let collectionPromise: Promise<Album[]> | null = null;

export function loadCollection(): Promise<Album[]> {
  if (!collectionPromise) {
    collectionPromise = fetch('/collection.json')
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load collection: ${res.status}`);
        return res.json() as Promise<Album[]>;
      })
      .catch(err => {
        collectionPromise = null;
        throw err;
      });
  }
  return collectionPromise;
}

export function useCollection(): { albums: Album[]; loading: boolean; error: string | null } {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
