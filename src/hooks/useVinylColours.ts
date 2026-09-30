import { useCallback, useMemo } from 'react';
import { useCollection } from '@/lib/collection';

/**
 * A lookup from an album's URI to its pressing colours (`vinyl_colours`), read
 * from the collection. For pages whose own release shape does not carry them
 * (Wrapped, search results); pages holding a collection album read
 * `album.vinyl_colours` directly.
 */
export function useVinylColours(): (uri: string | null | undefined) => string[] | undefined {
  const { albums } = useCollection();
  const byUri = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of albums) if (a.vinyl_colours?.length) map.set(a.uri_release, a.vinyl_colours);
    return map;
  }, [albums]);
  return useCallback(uri => (uri ? byUri.get(uri) : undefined), [byUri]);
}
