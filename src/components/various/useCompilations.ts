import { useEffect, useState } from 'react';
import { loadCompilations, type CompilationsData } from '@/lib/compilations';

/** compilations.json, loaded once and shared; null until it arrives (or when `enabled` is false). */
export function useCompilations(enabled = true): CompilationsData | null {
  const [data, setData] = useState<CompilationsData | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadCompilations()
      .then(d => {
        if (alive) setData(d);
      })
      .catch(err => console.error('Error loading compilations:', err));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? data : null;
}
